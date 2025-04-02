// === Cookie Utilities ===
function setCookie(name, value, days) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}

function getCookie(name) {
    const cookieArr = document.cookie.split("; ");
    for (let cookie of cookieArr) {
        const [key, val] = cookie.split("=");
        if (key === name) return decodeURIComponent(val);
    }
    return null;
}

// === On Load: Restore Form Values ===
window.addEventListener('load', () => {
    const saved = getCookie("routeFormData");
    if (saved) {
        const data = JSON.parse(saved);
        for (let key in data) {
            const input = document.querySelector(`[name="${key}"], #${key}`);
            if (input) input.value = data[key];
        }
    }
});


// === Leaflet Map Setup ===
const map = L.map('map').setView([52.24, 6.85], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
}).addTo(map);

const startIcon = L.icon({
    iconUrl: 'https://img.icons8.com/?size=100&id=10664&format=png&color=000000',
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30]
});

const endIcon = L.icon({
    iconUrl: 'https://img.icons8.com/?size=100&id=9811&format=png&color=000000',
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30]
});

const eventIcons = {
    "Bridge": L.icon({
        iconUrl: 'https://img.icons8.com/?size=100&id=5033&format=png&color=000000',
        iconSize: [18, 18],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12]
    }),
    "Lock": L.icon({
        iconUrl: 'https://img.icons8.com/?size=100&id=15437&format=png&color=000000',
        iconSize: [18, 18],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12]
    }),
    "Rdocal": L.icon({
        iconUrl: 'https://img.icons8.com/?size=100&id=86674&format=png&color=000000',
        iconSize: [18, 18],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12]
    }),
    "Vpln": L.icon({
        iconUrl: 'https://img.icons8.com/?size=100&id=3485&format=png&color=000000',
        iconSize: [18, 18],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12]
    })
};

const keyMap = {
    "Comcha": "Communication Channel VHF",
    "Rdocal": "Radio Call",
    "AirDraught": "Air Draught Height",
    "AirDraughtClosed": "Closed Air Draught Height",
    "AirDraughtSource": "Source of Air Draught",
    "AirDraughtClosedSource": "Source of Closed Air Draught",
    "Operatable": "Bridge Status",
    "ClearanceWidth": "Clearance Width",
    "AllowedWidth": "Allowed Width"
};

// === Form Submission Handler ===
document.getElementById('routeForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const plainObject = Object.fromEntries(formData.entries());

    // Save label inputs manually too
    plainObject["startISRS_label"] = document.getElementById("startISRS_label").value;
    plainObject["endISRS_label"] = document.getElementById("endISRS_label").value;

    setCookie("routeFormData", JSON.stringify(plainObject), 7);
    fetchRoute("FASTEST");
});

document.getElementById('calculateShortest').addEventListener('click', () => {
    fetchRoute("SHORTEST");
});

// === API Call + Map Rendering ===
function fetchRoute(routeType) {
    const formData = new FormData(document.getElementById('routeForm'));
    formData.append('computationType', routeType);

    fetch('/calculate-route', {
        method: 'POST',
        body: formData
    })
        .then(response => response.json())
        .then(data => {
            // 🛑 Check dimension limits before updating UI
            if (!checkDimensionLimits(Object.fromEntries(formData), data.dimensions)) {
                return;
            }

            displayRouteDetails(data);
            displayMapData(data);

            if (routeType === "FASTEST") {
                document.getElementById('calculateShortest').textContent = `Shortest Route`;
                document.getElementById('calculateShortest').disabled = false;
            }
        })
        .catch(error => console.error('Error:', error));
}


function displayRouteDetails(data) {
    const itinerary = data;

    document.getElementById('message').textContent = itinerary.legs[0]?.message || '-';
    document.getElementById('computationType').textContent = `${itinerary.computationType} route`;
    document.getElementById('totalLength').textContent = `${itinerary.totalLengthKm} km`;
    document.getElementById('totalDuration').textContent = itinerary.totalDuration;
    document.getElementById('tideDependent').textContent = itinerary.tideDependent;
    document.getElementById('numberOfLocks').textContent = itinerary.numberOfLocks;

    document.getElementById('dimHeight').textContent = itinerary.dimensions.Height;
    document.getElementById('dimWidth').textContent = itinerary.dimensions.Width;
    document.getElementById('dimDraught').textContent = itinerary.dimensions.Draught;
    document.getElementById('dimLength').textContent = itinerary.dimensions.Length;
    document.getElementById('dimCEMT').textContent = itinerary.dimensions.CEMT;
}

function checkDimensionLimits(userInput, allowedDimensions) {
    const errors = [];

    const fields = {
        draught: "Draught",
        height: "Height",
        length: "Length",
        width: "Width"
    };

    for (const [key, label] of Object.entries(fields)) {
        const formValue = parseFloat(document.getElementById(key).value);
        const allowedValue = parseFloat(allowedDimensions[label]) || 0;

        if (!isNaN(formValue) && formValue > allowedValue * 100) {
            errors.push(`${label}: ${formValue} cm is greater than allowed ${allowedValue * 100} cm`);
        }
    }

    if (errors.length > 0) {
        showErrorPopup("Your vessel exceeds permissible limits:<br>" + errors.join("<br>"));
        return false;
    }

    return true;
}


function displayMapData(data) {
    // Clear previous layers
    map.eachLayer(layer => {
        if (layer instanceof L.Marker || layer instanceof L.Polyline) {
            map.removeLayer(layer);
        }
    });

    // Route polyline
    if (data.geometry && data.geometry.length > 0) {
        const latlngs = data.geometry.map(p => [p.lat, p.lon]);
        const routeLine = L.polyline(latlngs, { color: 'blue' }).addTo(map);
        map.fitBounds(routeLine.getBounds());

        L.marker(latlngs[0], { icon: startIcon }).addTo(map).bindPopup(`Start: ${data.fromObjectName}`);
        L.marker(latlngs[latlngs.length - 1], { icon: endIcon }).addTo(map).bindPopup(`End: ${data.toObjectName}`);
    }

    // Event markers
    data.events.forEach(event => {
        const icon = eventIcons[event.type] || L.icon({
            iconUrl: 'https://img.icons8.com/default-icon.png',
            iconSize: [18, 18],
            iconAnchor: [10, 10],
            popupAnchor: [0, -10]
        });

        const popup = `<b>${event.type}: ${event.name}</b>` + formatEventProperties(event.properties);
        L.marker([event.lng, event.lat], { icon }).addTo(map).bindPopup(popup);
    });
}

function formatEventProperties(properties) {
    if (!properties) return '';
    let html = '<ul>';
    for (const [key, val] of Object.entries(properties)) {
        let displayName = keyMap[key] || key;
        let value = val;

        if (["AirDraught", "AirDraughtClosed", "ClearanceWidth", "AllowedWidth"].includes(key)) {
            value = (parseFloat(val) / 100).toFixed(2) + ' m';
        }

        if (key === "Operatable") {
            value = val === "1" ? "Movable" : "Fixed";
        }

        html += `<li>${displayName}: ${value}</li>`;
    }
    html += '</ul>';
    return html;
}
function showErrorPopup(message) {
    const popup = document.getElementById('dimensionError');
    if (!popup) return;

    popup.innerHTML = message;
    popup.classList.remove('hidden');
    popup.classList.add('show');

    // Automatically hide after 5 seconds
    setTimeout(() => {
        popup.classList.remove('show');
        // Let fade-out animation complete before hiding
        setTimeout(() => {
            popup.classList.add('hidden');
        }, 400); // match CSS transition duration
    }, 5000);
}

let locodeData = [];

fetch("/static/ports_list.json")
  .then(res => res.json())
  .then(data => {
    locodeData = data;
    setupAutocomplete("startISRS_label", "startSuggestions", "startISRS");
    setupAutocomplete("endISRS_label", "endSuggestions", "endISRS");
    ["startISRS_label", "endISRS_label"].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener("focus", () => {
                input.value = "";
                const hidden = document.getElementById(id.replace("_label", ""));
                if (hidden) hidden.value = ""; // also clear hidden locode
            });
        }
    });
    

  });

  function setupAutocomplete(labelInputId, suggestionsId, hiddenInputId) {
    const labelInput = document.getElementById(labelInputId);
    const suggestionsBox = document.getElementById(suggestionsId);
    const hiddenInput = document.getElementById(hiddenInputId);
  
    labelInput.addEventListener("input", () => {
      const query = labelInput.value.toLowerCase();
      suggestionsBox.innerHTML = "";
  
      if (!query) {
        suggestionsBox.style.display = "none";
        hiddenInput.value = ""; // clear selected locode
        return;
      }
  
      const matches = locodeData.filter(item =>
        (item.loname && item.loname.toLowerCase().includes(query)) ||
        (item.objectname && item.objectname.toLowerCase().includes(query))
      );
  
      if (matches.length === 0) {
        suggestionsBox.style.display = "none";
        return;
      }
  
      matches.slice(0, 10).forEach(match => {
        const div = document.createElement("div");
        div.textContent = `${match.loname || ''} (${match.objectname || ''})`;
        div.addEventListener("click", () => {
          labelInput.value = `${match.loname || ''} (${match.objectname || ''})`;
          hiddenInput.value = match.locode; // ✅ locode stored here for API call
          suggestionsBox.innerHTML = "";
          suggestionsBox.style.display = "none";
        });
        suggestionsBox.appendChild(div);
      });
  
      suggestionsBox.style.display = "block";
    });
  
    document.addEventListener("click", (e) => {
      if (!suggestionsBox.contains(e.target) && e.target !== labelInput) {
        suggestionsBox.innerHTML = "";
        suggestionsBox.style.display = "none";
      }
    });
  }
  
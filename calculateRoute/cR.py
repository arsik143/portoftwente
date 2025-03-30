from flask import Flask, request, jsonify, render_template
import requests
import json
import psycopg2
import polyline

app = Flask(__name__, template_folder="webapp")

@app.route('/')
def index():
    return render_template('map.html')

@app.route('/calculate-route', methods=['POST'])
def calculate_route():
    # Extract parameters from received form data
    start_isrs = request.form.get('startISRS')
    end_isrs = request.form.get('endISRS')
    computation_type = request.form.get('computationType', 'FASTEST')  # Default to FASTEST
    draught = request.form.get('draught', 0)
    height = request.form.get('height', 0)
    length = request.form.get('length', 0)
    width = request.form.get('width', 0)
    # Set up the payload for the API request
    payload = {
        'startISRS': start_isrs,
        'endISRS': end_isrs,
        'AllowedDimensions': {
            'Draught': draught,
            'Height': height,
            'Length': length,
            'Width': width,
        },
        'resultFormatting': {
            'splitGeometry': False,
            'resultLanguage': 'nl',
            'returnTranslatedNames': False
        },
        'calculationOptions': {
            'useReducedDimensions': False,
            'computationType': computation_type
        },
        'viaPoints': [
            {'iSRS': start_isrs}, {'iSRS': end_isrs}
        ]
    }

    # Send a POST request to the API
    response = requests.post('https://www.eurisportal.eu/api/RouteCalculatorV2/CalculateRoute', json=payload)
    data = response.json()

    from_object_name = data['Itineraries'][0]['Legs'][0]['FromObjectName']
    to_object_name = data['Itineraries'][0]['Legs'][0]['ToObjectName']

    # Assuming the API returns a polyline encoded geometry
    encoded_geometry = data['Itineraries'][0]['Geometry']['paths'][0]
    decoded_geometry = polyline.decode(encoded_geometry)
    decoded_points = [{'lat': lat/10, 'lon': lon/10} for lat, lon in decoded_geometry]


    events = []
    legs = []

    for itinerary in data.get('Itineraries', []):
        for leg in itinerary.get('Legs', []):
            legs.append({
                            "message": leg.get('Message'),
                            "length": leg.get('Length')
                        })
            for segment in leg.get('Segments', []):
                for event in segment.get('Events', []):
                    if event['Latitude'] and event['Longitude']:
                        events.append({
                            "type": event.get('EventType'),
                            "name": event.get('ObjectName'),
                            "message": event.get('EventMessage'),
                            "lat": event['Latitude'],
                            "lng": event['Longitude'],
                            "properties": event['EventProperties']
                        })
    itinerary = data['Itineraries'][0]

    total_length_km = round(itinerary.get('TotalLength', 0) / 1000)  # Convert meters to kilometers and round
    total_duration_hours = itinerary.get('TotalDuration', 0) // 3600
    total_duration_minutes = (itinerary.get('TotalDuration', 0) % 3600) // 60
    formatted_duration = f"{total_duration_hours}h {total_duration_minutes}min"

    response_data = {
        'totalLengthKm': total_length_km,
        'totalDuration': formatted_duration,
        'geometry': decoded_points,  # This is your route geometry list of dicts
        'fromObjectName': from_object_name,
        'toObjectName': to_object_name,
        'events': events,
        'legs': legs,
        'tideDependent': "Yes" if itinerary['TideDependent'] else "Not Dependent",
        'numberOfLocks': itinerary['NumberOfLocks'],
        'dimensions': format_dimensions(itinerary['AllowedDimensions']),
        'computationType': data['Itineraries'][0].get('ComputationType', 'Unknown')
    }
    print("Events data to be sent to frontend:", response_data['events'])


    return jsonify(response_data)

def format_dimensions(dimensions):
    # Convert cm to meters and format the string
    return {
        "Height": f"{int(dimensions.get('Height', 0)) / 100:.2f} m",
        "Width": f"{int(dimensions.get('Width', 0)) / 100:.2f} m",
        "Draught": f"{int(dimensions.get('Draught', 0)) / 100:.2f} m",
        "Length": f"{int(dimensions.get('Length', 0)) / 100:.2f} m",
        "CEMT": dimensions.get('CEMT', 'N/A')
    }


if __name__ == '__main__':
    app.run(debug=True, port=5002)
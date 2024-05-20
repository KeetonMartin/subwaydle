import React, { useRef, useEffect, useState } from 'react';
import mapboxgl from '!mapbox-gl'; // eslint-disable-line import/no-webpack-loader-syntax

import { todayGameIndex, todaysTrip, todaysSolution, isWeekend, isNight, isAccessible } from '../utils/answerValidations';

import stations from "../data/stations.json";
import routes from "../data/routes.json";
import shapes from "../data/shapes.json";

import './MapFrame.scss';

mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_TOKEN;

const MANHATTAN_TILT = 29;

const MapFrame = (props) => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [lng, setLng] = useState(-73.98119);
  const [lat, setLat] = useState(40.75855);
  const [zoom, setZoom] = useState(12);
  const [currentDayIndex, setCurrentDayIndex] = useState(todayGameIndex());
  const [markedSolutions, setMarkedSolutions] = useState([]);
  const [mapLoaded, setMapLoaded] = useState(false); // New state to track map load

  const updateDayIndex = (newIndex) => {
    setCurrentDayIndex(newIndex);
  };

  const stopsGeoJson = (solution) => {
    const stops = [
      solution.origin,
      solution.first_transfer_arrival,
      solution.first_transfer_departure,
      solution.second_transfer_arrival,
      solution.second_transfer_departure,
      solution.destination
    ];
    return {
      "type": "FeatureCollection",
      "features": [...new Set(stops)].map((stopId) => {
        const station = stations[stopId];
        return {
          "type": "Feature",
          "properties": {
            "id": stopId,
            "name": station.name,
          },
          "geometry": {
            "type": "Point",
            "coordinates": [station.longitude, station.latitude]
          }
        }
      })
    };
  }

  const lineGeoJson = (line) => {
    const route = routes[line.route];
    let shape;
    const beginCoord = [stations[line.begin].longitude, stations[line.begin].latitude];
    const endCoord = [stations[line.end].longitude, stations[line.end].latitude];
    let coordinates = [];

    if (line.route === 'A') {
      const lineA1 = shapes['A1'];
      if (lineA1.some((coord) => coord[0] === beginCoord[0] && coord[1] === beginCoord[1]) && lineA1.some((coord) => coord[0] === endCoord[0] && coord[1] === endCoord[1])) {
        shape = shapes['A1'];
      } else {
        shape = shapes['A2'];
      }
    } else {
      shape = shapes[line.route];
    }

    const beginIndex = shape.findIndex((coord) => coord[0] === beginCoord[0] && coord[1] === beginCoord[1]);
    const endIndex = shape.findIndex((coord) => coord[0] === endCoord[0] && coord[1] === endCoord[1]);

    if (beginIndex < endIndex) {
      coordinates = shape.slice(beginIndex, endIndex + 1);
    } else {
      coordinates = shape.slice(endIndex, beginIndex + 1);
    }

    return {
      "type": "Feature",
      "properties": {
        "color": route.color,
      },
      "geometry": {
        "type": "LineString",
        "coordinates": coordinates
      }
    }
  }

  const displaySolution = (solution) => {
    if (!map.current || !mapLoaded) return;

    const stopsJson = stopsGeoJson(solution);
    map.current.getSource('Stops').setData(stopsJson);

    [
      {
        route: todaysTrip(currentDayIndex)[0],
        begin: solution.origin,
        end: solution.first_transfer_arrival,
      },
      {
        route: todaysTrip(currentDayIndex)[1],
        begin: solution.first_transfer_departure,
        end: solution.second_transfer_arrival,
      },
      {
        route: todaysTrip(currentDayIndex)[2],
        begin: solution.second_transfer_departure,
        end: solution.destination,
      },
    ].forEach((line, i) => {
      const lineJson = lineGeoJson(line);
      map.current.getSource(`line-${i}`).setData(lineJson);
    });

    const coordinates = stopsJson.features.map(feature => feature.geometry.coordinates);
    const bounds = coordinates.reduce((bounds, coord) => {
      return bounds.extend(coord);
    }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));

    if (!bounds.isEmpty()) {
      map.current.fitBounds(bounds, {
        padding: {
          top: 20,
          right: 20,
          left: 20,
          bottom: 150,
        },
        bearing: MANHATTAN_TILT,
      });
    }
  };

  const handleMarkAsWeird = () => {
    const solution = todaysSolution(currentDayIndex);
    setMarkedSolutions([...markedSolutions, solution]);
  };

  useEffect(() => {
    if (map.current) return; // initialize map only once
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v10?optimize=true',
      center: [lng, lat],
      bearing: MANHATTAN_TILT,
      minZoom: 9,
      zoom: zoom,
      maxBounds: [
        [-74.8113, 40.1797],
        [-73.3584, 41.1247]
      ],
      maxPitch: 0,
    });
    map.current.dragRotate.disable();
    map.current.touchZoomRotate.disableRotation();

    map.current.on('load', () => {
      setMapLoaded(true); // Set map loaded to true

      // Initialize layers
      map.current.addSource("Stops", { "type": "geojson", "data": stopsGeoJson(todaysSolution(currentDayIndex)) });
      map.current.addLayer({
        "id": "Stops",
        "type": "symbol",
        "source": "Stops",
        "layout": {
          "text-field": ['get', 'name'],
          "text-size": 12,
          "text-font": ['Lato Bold', "Open Sans Bold","Arial Unicode MS Bold"],
          "text-optional": false,
          "text-justify": "auto",
          'text-allow-overlap': false,
          "text-padding": 1,
          "text-variable-anchor": ["bottom-right", "top-right", "bottom-left", "top-left", "right", "left", "bottom"],
          "text-radial-offset": 0.5,
          "icon-image": "express-stop",
          "icon-size": 8/13,
          "icon-allow-overlap": true,
        },
        "paint": {
          "text-color": '#ffffff',
        },
      });

      [0, 1, 2].forEach(i => {
        map.current.addSource(`line-${i}`, { "type": "geojson", "data": { "type": "Feature", "geometry": { "type": "LineString", "coordinates": [] } } });
        map.current.addLayer({
          "id": `line-${i}`,
          "type": "line",
          "source": `line-${i}`,
          "layout": {
            "line-join": "miter",
            "line-cap": "round",
          },
          "paint": {
            "line-width": 2,
            "line-color": ["get", "color"],
          }
        });
      });

      displaySolution(todaysSolution(currentDayIndex));
    });
  }, []);

  useEffect(() => {
    if (!map.current) return; // wait for map to initialize
    map.current.on('move', () => {
      setLng(map.current.getCenter().lng.toFixed(4));
      setLat(map.current.getCenter().lat.toFixed(4));
      setZoom(map.current.getZoom().toFixed(2));
    });
  }, []);

  useEffect(() => {
    if (mapLoaded) {
      displaySolution(todaysSolution(currentDayIndex));
    }
  }, [currentDayIndex, mapLoaded]);

  return (
    <div>
      <div ref={mapContainer} className="map-container" />
      <div className="solution-controls">
        <button onClick={() => updateDayIndex(currentDayIndex - 1)}>Previous Day</button>
        <button onClick={() => updateDayIndex(currentDayIndex + 1)}>Next Day</button>
      </div>
      <div className="solution-list">
        <button onClick={handleMarkAsWeird}>Mark Current as Weird</button>
      </div>
    </div>
  );
}

export default MapFrame;


import React, { useState, useEffect, useRef } from 'react';
import { 
  Navigation, 
  TrendingUp, 
  TrendingDown, 
  Info,
  RefreshCw,
  Calculator,
  Upload,
  CheckCircle2,
  FileCode,
  AlertTriangle,
  Mountain,
  FileArchive,
  Wand2,
  ExternalLink,
  HelpCircle,
  X,
  Map as MapIcon,
  LocateFixed,
  Target,
  Route,
  MapPin,
  Trash2,
  ShieldCheck,
  FileText,
  Zap
} from 'lucide-react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Area, 
  AreaChart,
  ReferenceDot,
  ReferenceLine
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import UtmConverter from 'utm-latlng';
import { XMLParser } from 'fast-xml-parser';
import JSZip from 'jszip';
import { Point, VisibilityResult } from './types';
import { calculateVisibility } from './utils/visibility';
import { 
  MapContainer, 
  TileLayer, 
  Polyline, 
  Marker, 
  Popup, 
  useMapEvents,
  useMap
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in Leaflet
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const utmConverter = new UtmConverter();

// Helper for Haversine distance in meters
const getDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

export default function App() {
  const [path, setPath] = useState<Point[]>([]);
  const [observerIndex, setObserverIndex] = useState<number | null>(null);
  const [visibility, setVisibility] = useState<VisibilityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kmlLoaded, setKmlLoaded] = useState(false);
  const [elevationStats, setElevationStats] = useState<{ min: number; max: number; hasZ: boolean } | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [distanceToAxis, setDistanceToAxis] = useState<number | null>(null);

  // Visibility Parameters
  const [eyeHeight, setEyeHeight] = useState<number>(1.20);
  const [objectHeight, setObjectHeight] = useState<number>(0.60);
  const [lateralOffset, setLateralOffset] = useState<number>(3.0);
  const [speedLimit, setSpeedLimit] = useState<number>(80);

  // Draft states for parameters
  const [draftEyeHeight, setDraftEyeHeight] = useState<number>(1.20);
  const [draftObjectHeight, setDraftObjectHeight] = useState<number>(0.60);
  const [draftLateralOffset, setDraftLateralOffset] = useState<number>(3.0);
  const [draftSpeedLimit, setDraftSpeedLimit] = useState<number>(80);

  // Coordinate Input States
  const [coordFormat, setCoordFormat] = useState<'utm' | 'dd' | 'dms'>('utm');
  
  // UTM Inputs
  const [utmEasting, setUtmEasting] = useState<string>('');
  const [utmNorthing, setUtmNorthing] = useState<string>('');
  const [utmZone, setUtmZone] = useState<string>('22');
  const [utmHemisphere, setUtmHemisphere] = useState<'N' | 'S'>('S');

  // Decimal Degrees Inputs
  const [ddLat, setDdLat] = useState<string>('');
  const [ddLng, setDdLng] = useState<string>('');

  // DMS Inputs
  const [dmsLatDeg, setDmsLatDeg] = useState<string>('');
  const [dmsLatMin, setDmsLatMin] = useState<string>('');
  const [dmsLatSec, setDmsLatSec] = useState<string>('');
  const [dmsLatDir, setDmsLatDir] = useState<'N' | 'S'>('S');
  const [dmsLngDeg, setDmsLngDeg] = useState<string>('');
  const [dmsLngMin, setDmsLngMin] = useState<string>('');
  const [dmsLngSec, setDmsLngSec] = useState<string>('');
  const [dmsLngDir, setDmsLngDir] = useState<'E' | 'W'>('W');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const dmsToDecimal = (deg: string, min: string, sec: string, dir: string) => {
    const d = parseFloat(deg) || 0;
    const m = parseFloat(min) || 0;
    const s = parseFloat(sec) || 0;
    let dd = d + m / 60 + s / 3600;
    if (dir === 'S' || dir === 'W') dd = dd * -1;
    return dd;
  };

  const formatKm = (meters: number) => {
    const km = Math.floor(meters / 1000);
    const m = (meters % 1000).toFixed(2);
    return `Km ${km} + ${m}m`;
  };

  const calculateRequiredSSD = (v: number) => {
    // Simplified DNIT/AASHTO formula for level ground
    // d = 0.278 * t * v + v^2 / (254 * f)
    // t = 2.5s (perception-reaction), f = 0.35 (friction)
    const t = 2.5;
    const f = 0.35;
    return (0.278 * t * v) + (Math.pow(v, 2) / (254 * f));
  };

  const handleCoordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!kmlLoaded) {
      setError("Importe um arquivo KML/KMZ/GPX primeiro.");
      return;
    }

    let lat: number, lng: number;

    try {
      if (coordFormat === 'utm') {
        if (!utmEasting || !utmNorthing || !utmZone) {
          setError("Preencha todos os campos UTM.");
          return;
        }
        const latLng = utmConverter.convertUtmToLatLng(
          parseFloat(utmEasting),
          parseFloat(utmNorthing),
          parseInt(utmZone),
          utmHemisphere === 'S' ? 'S' : 'N'
        ) as { lat: number; lng: number };
        lat = latLng.lat;
        lng = latLng.lng;
      } else if (coordFormat === 'dd') {
        if (!ddLat || !ddLng) {
          setError("Preencha as coordenadas decimais.");
          return;
        }
        lat = parseFloat(ddLat);
        lng = parseFloat(ddLng);
      } else {
        if (!dmsLatDeg || !dmsLngDeg) {
          setError("Preencha os graus das coordenadas DMS.");
          return;
        }
        lat = dmsToDecimal(dmsLatDeg, dmsLatMin, dmsLatSec, dmsLatDir);
        lng = dmsToDecimal(dmsLngDeg, dmsLngMin, dmsLngSec, dmsLngDir);
      }

      if (isNaN(lat) || isNaN(lng)) {
        throw new Error("Coordenadas inválidas.");
      }
      
      findClosestPointInPath(lat, lng);
    } catch (err) {
      setError("Erro ao converter coordenadas. Verifique os valores digitados.");
    }
  };

  const findClosestPointInPath = (lat: number, lng: number) => {
    if (path.length === 0) return;

    let closestIdx = 0;
    let minDist = Infinity;

    path.forEach((p, i) => {
      const d = getDistanceMeters(lat, lng, p.lat, p.lng);
      if (d < minDist) {
        minDist = d;
        closestIdx = i;
      }
    });

    setDistanceToAxis(minDist);
    setObserverIndex(closestIdx);
    updateVisibility(path, closestIdx);
  };

  const handleApplyParameters = () => {
    setEyeHeight(draftEyeHeight);
    setObjectHeight(draftObjectHeight);
    setLateralOffset(draftLateralOffset);
    setSpeedLimit(draftSpeedLimit);
    
    if (observerIndex !== null && path.length > 0) {
      // We need to use the new values directly because state updates are async
      const resInc = calculateVisibility(path, observerIndex, draftEyeHeight, draftObjectHeight, draftLateralOffset, 1);
      const resDec = calculateVisibility(path, observerIndex, draftEyeHeight, draftObjectHeight, draftLateralOffset, -1);

      setVisibility({
        increasing: resInc.distance,
        decreasing: resDec.distance,
        observerIndex: observerIndex,
        increasingTargetIndex: resInc.targetIndex,
        decreasingTargetIndex: resDec.targetIndex,
        increasingLimitingFactor: resInc.limitingFactor,
        decreasingLimitingFactor: resDec.limitingFactor,
        path: path
      });
    }
  };

  const handleResetParameters = () => {
    const defaults = {
      eye: 1.20,
      obj: 0.60,
      lat: 3.0,
      speed: 80
    };
    
    setDraftEyeHeight(defaults.eye);
    setDraftObjectHeight(defaults.obj);
    setDraftLateralOffset(defaults.lat);
    setDraftSpeedLimit(defaults.speed);
    
    setEyeHeight(defaults.eye);
    setObjectHeight(defaults.obj);
    setLateralOffset(defaults.lat);
    setSpeedLimit(defaults.speed);

    if (observerIndex !== null && path.length > 0) {
      const resInc = calculateVisibility(path, observerIndex, defaults.eye, defaults.obj, defaults.lat, 1);
      const resDec = calculateVisibility(path, observerIndex, defaults.eye, defaults.obj, defaults.lat, -1);

      setVisibility({
        increasing: resInc.distance,
        decreasing: resDec.distance,
        observerIndex: observerIndex,
        increasingTargetIndex: resInc.targetIndex,
        decreasingTargetIndex: resDec.targetIndex,
        increasingLimitingFactor: resInc.limitingFactor,
        decreasingLimitingFactor: resDec.limitingFactor,
        path: path
      });
    }
  };

  const updateVisibility = (currentPath: Point[], idx: number) => {
    const resInc = calculateVisibility(currentPath, idx, eyeHeight, objectHeight, lateralOffset, 1);
    const resDec = calculateVisibility(currentPath, idx, eyeHeight, objectHeight, lateralOffset, -1);

    setVisibility({
      increasing: resInc.distance,
      decreasing: resDec.distance,
      observerIndex: idx,
      increasingTargetIndex: resInc.targetIndex,
      decreasingTargetIndex: resDec.targetIndex,
      increasingLimitingFactor: resInc.limitingFactor,
      decreasingLimitingFactor: resDec.limitingFactor,
      path: currentPath
    });
  };

  const findClosestPointByDistance = (distance: number) => {
    if (path.length === 0) return;

    let closestIdx = 0;
    let minDist = Infinity;

    path.forEach((p, i) => {
      const d = Math.abs(p.distance - distance);
      if (d < minDist) {
        minDist = d;
        closestIdx = i;
      }
    });

    setDistanceToAxis(0);
    setObserverIndex(closestIdx);
    updateVisibility(path, closestIdx);
  };

  // Map Click Handler Component
  const MapClickHandler = () => {
    useMapEvents({
      click: (e) => {
        if (path.length > 0) {
          findClosestPointInPath(e.latlng.lat, e.latlng.lng);
        } else {
          createQuickPath(e.latlng.lat, e.latlng.lng);
        }
      },
    });
    return null;
  };

  // Component to auto-center map on path
  const MapAutoCenter = ({ path }: { path: Point[] }) => {
    const map = useMap();
    useEffect(() => {
      if (path.length > 0) {
        const bounds = L.latLngBounds(path.map(p => [p.lat, p.lng]));
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }, [path, map]);
    return null;
  };

  const densifyPath = () => {
    if (path.length < 2) return;
    
    const targetInterval = 20; // 20 meters
    const newPath: Point[] = [];
    
    for (let i = 0; i < path.length - 1; i++) {
      const start = path[i];
      const end = path[i + 1];
      const segmentDist = getDistanceMeters(start.lat, start.lng, end.lat, end.lng);
      
      newPath.push(start);
      
      if (segmentDist > targetInterval) {
        const numSteps = Math.floor(segmentDist / targetInterval);
        for (let j = 1; j <= numSteps; j++) {
          const ratio = j / (numSteps + 1);
          const lat = start.lat + (end.lat - start.lat) * ratio;
          const lng = start.lng + (end.lng - start.lng) * ratio;
          const elevation = start.elevation + (end.elevation - start.elevation) * ratio;
          const distance = start.distance + (end.distance - start.distance) * ratio;
          
          newPath.push({ lat, lng, elevation, distance });
        }
      }
    }
    
    newPath.push(path[path.length - 1]);
    setPath(newPath);
    
    // Recalculate visibility if observer was set
    if (observerIndex !== null) {
      // Find new observer index (closest to old position)
      const oldObserver = path[observerIndex];
      let closestIdx = 0;
      let minDist = Infinity;
      newPath.forEach((p, idx) => {
        const d = getDistanceMeters(oldObserver.lat, oldObserver.lng, p.lat, p.lng);
        if (d < minDist) {
          minDist = d;
          closestIdx = idx;
        }
      });
      setObserverIndex(closestIdx);
      updateVisibility(newPath, closestIdx);
    }
  };

  const fetchElevationData = async (targetPath?: Point[]) => {
    const pathToProcess = targetPath || path;
    if (pathToProcess.length === 0) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const locations = pathToProcess.map(p => ({ latitude: p.lat, longitude: p.lng }));
      
      const response = await fetch('https://api.open-elevation.com/api/v1/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations })
      });

      if (!response.ok) throw new Error("A API de relevo está ocupada. Tente novamente em instantes.");

      const data = await response.json();
      const elevations = data.results;

      const updatedPath = pathToProcess.map((p, i) => ({
        ...p,
        elevation: elevations[i].elevation
      }));

      let minElev = Infinity;
      let maxElev = -Infinity;
      updatedPath.forEach(p => {
        if (p.elevation < minElev) minElev = p.elevation;
        if (p.elevation > maxElev) maxElev = p.elevation;
      });

      setPath(updatedPath);
      setElevationStats({
        min: minElev,
        max: maxElev,
        hasZ: true
      });
      
      if (observerIndex !== null) {
        updateVisibility(updatedPath, observerIndex);
      } else if (targetPath) {
        // For quick path, set observer to middle
        const midIdx = Math.floor(updatedPath.length / 2);
        setObserverIndex(midIdx);
        updateVisibility(updatedPath, midIdx);
      }

    } catch (err: any) {
      setError("Erro ao buscar relevo: " + err.message + ". Tente usar o site gpx.studio para corrigir o arquivo.");
    } finally {
      setLoading(false);
    }
  };

  const createQuickPath = (lat: number, lng: number) => {
    const points: Point[] = [];
    const step = 20; // 20 meters
    const totalDist = 4000; // 4km total
    const halfDist = totalDist / 2;
    
    // Create an East-West straight line for now
    // 1 degree lat ~ 111km
    // 1 degree lng ~ 111km * cos(lat)
    const latRad = lat * Math.PI / 180;
    const metersPerDegreeLng = 111320 * Math.cos(latRad);
    
    for (let d = -halfDist; d <= halfDist; d += step) {
      const offsetLng = d / metersPerDegreeLng;
      points.push({
        lat: lat,
        lng: lng + offsetLng,
        elevation: 0,
        distance: d + halfDist
      });
    }
    
    setKmlLoaded(true);
    setPath(points);
    setObserverIndex(Math.floor(points.length / 2));
    fetchElevationData(points);
  };

  const processGpxContent = (gpxText: string) => {
    try {
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
      const jsonObj = parser.parse(gpxText);
      
      const gpx = jsonObj.gpx;
      if (!gpx) throw new Error("Estrutura GPX inválida.");

      let trackPoints: any[] = [];

      // Try Tracks (trk -> trkseg -> trkpt)
      if (gpx.trk) {
        const trks = Array.isArray(gpx.trk) ? gpx.trk : [gpx.trk];
        for (const trk of trks) {
          if (!trk) continue;
          const segments = Array.isArray(trk.trkseg) ? trk.trkseg : [trk.trkseg];
          for (const seg of segments) {
            if (seg && seg.trkpt) {
              const pts = Array.isArray(seg.trkpt) ? seg.trkpt : [seg.trkpt];
              trackPoints.push(...pts);
            }
          }
        }
      }

      // Try Routes (rte -> rtept) if no track points found
      if (trackPoints.length === 0 && gpx.rte) {
        const rtes = Array.isArray(gpx.rte) ? gpx.rte : [gpx.rte];
        for (const rte of rtes) {
          if (rte && rte.rtept) {
            const pts = Array.isArray(rte.rtept) ? rte.rtept : [rte.rtept];
            trackPoints.push(...pts);
          }
        }
      }

      // Try Waypoints (wpt) if still no points
      if (trackPoints.length === 0 && gpx.wpt) {
        trackPoints = Array.isArray(gpx.wpt) ? gpx.wpt : [gpx.wpt];
      }

      if (trackPoints.length === 0) {
        throw new Error("Nenhum ponto de trajeto (track, route ou waypoint) encontrado no arquivo GPX.");
      }

      let cumulativeDistance = 0;
      const processedPath: Point[] = [];
      let minElev = Infinity;
      let maxElev = -Infinity;
      let hasZ = false;

      for (let i = 0; i < trackPoints.length; i++) {
        const pt = trackPoints[i];
        if (!pt) continue;

        const lat = parseFloat(pt["@_lat"]);
        const lng = parseFloat(pt["@_lon"]);
        const alt = pt.ele ? parseFloat(pt.ele) : 0;

        if (isNaN(lat) || isNaN(lng)) continue;

        if (pt.ele !== undefined && !isNaN(alt)) {
          hasZ = true;
        }

        if (alt < minElev) minElev = alt;
        if (alt > maxElev) maxElev = alt;

        if (processedPath.length > 0) {
          const prev = processedPath[processedPath.length - 1];
          const dist = getDistanceMeters(prev.lat, prev.lng, lat, lng);
          cumulativeDistance += dist;
        }

        processedPath.push({
          lat,
          lng,
          elevation: alt,
          distance: cumulativeDistance
        });
      }

      if (processedPath.length === 0) {
        throw new Error("O arquivo GPX foi lido, mas não contém coordenadas válidas. Verifique se o arquivo contém um traçado (Track) ou rota (Route).");
      }

      setElevationStats({
        min: minElev === Infinity ? 0 : minElev,
        max: maxElev === -Infinity ? 0 : maxElev,
        hasZ: hasZ
      });

      setPath(processedPath);
      setKmlLoaded(true);
      setObserverIndex(0);
      setDistanceToAxis(null);
      updateVisibility(processedPath, 0);

    } catch (err: any) {
      setError("Erro ao processar GPX: " + err.message);
    }
  };

  const processKmlContent = (kmlText: string) => {
    try {
      const parser = new XMLParser({ ignoreAttributes: false });
      const jsonObj = parser.parse(kmlText);
      
      let coordsStr = "";
      const findCoords = (obj: any) => {
        if (typeof obj !== 'object' || obj === null) return;
        
        // Handle LineString, Point, Polygon, etc.
        if (obj.coordinates) {
          if (typeof obj.coordinates === 'string') {
            coordsStr += " " + obj.coordinates;
          } else if (typeof obj.coordinates === 'number') {
            coordsStr += " " + obj.coordinates.toString();
          }
        }
        
        // Handle Google Earth gx:Track extensions
        if (obj['gx:coord']) {
          const gxCoords = Array.isArray(obj['gx:coord']) ? obj['gx:coord'] : [obj['gx:coord']];
          for (const c of gxCoords) {
            if (typeof c === 'string') {
              // gx:coord is usually "lng lat alt" separated by space
              const parts = c.trim().split(/\s+/);
              if (parts.length >= 2) {
                coordsStr += ` ${parts[0]},${parts[1]},${parts[2] || 0}`;
              }
            }
          }
        }
        
        if (Array.isArray(obj)) {
          for (const item of obj) {
            findCoords(item);
          }
        } else {
          for (const key in obj) {
            if (key !== 'coordinates' && key !== 'gx:coord') {
              findCoords(obj[key]);
            }
          }
        }
      };

      findCoords(jsonObj);

      if (!coordsStr.trim()) {
        throw new Error("Não foi possível encontrar coordenadas no arquivo. Verifique se o arquivo contém um 'Caminho' (Path) ou 'Trajeto' e se foi exportado corretamente.");
      }

      const coordPairs = coordsStr.trim().split(/\s+/);
      let cumulativeDistance = 0;
      const processedPath: Point[] = [];
      let minElev = Infinity;
      let maxElev = -Infinity;
      let hasZ = false;

      for (let i = 0; i < coordPairs.length; i++) {
        const parts = coordPairs[i].split(',');
        if (parts.length < 2) continue;

        const lng = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        const alt = parts[2] ? parseFloat(parts[2]) : 0;
        
        if (isNaN(lat) || isNaN(lng)) continue;

        if (parts[2] && !isNaN(alt) && alt !== 0) {
          hasZ = true;
        }

        if (alt < minElev) minElev = alt;
        if (alt > maxElev) maxElev = alt;

        if (processedPath.length > 0) {
          const prev = processedPath[processedPath.length - 1];
          const dist = getDistanceMeters(prev.lat, prev.lng, lat, lng);
          cumulativeDistance += dist;
        }

        processedPath.push({
          lat,
          lng,
          elevation: isNaN(alt) ? 0 : alt,
          distance: cumulativeDistance
        });
      }

      if (processedPath.length === 0) {
        throw new Error("Arquivo não contém coordenadas válidas. Verifique se você exportou o 'Caminho' (Path) corretamente no Google Earth.");
      }

      setElevationStats({
        min: minElev === Infinity ? 0 : minElev,
        max: maxElev === -Infinity ? 0 : maxElev,
        hasZ: hasZ
      });

      setPath(processedPath);
      setKmlLoaded(true);
      setObserverIndex(0);
      setDistanceToAxis(null);
      updateVisibility(processedPath, 0);

    } catch (err: any) {
      setError("Erro ao processar conteúdo: " + err.message);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setElevationStats(null);
    setDistanceToAxis(null);

    const fileName = file.name.toLowerCase();

    try {
      if (fileName.endsWith('.kmz')) {
        const zip = new JSZip();
        const contents = await zip.loadAsync(file);
        const kmlFile = Object.keys(contents.files).find(f => f.toLowerCase().endsWith('.kml'));
        
        if (!kmlFile) {
          throw new Error("Não foi encontrado nenhum arquivo KML dentro do KMZ.");
        }
        
        const kmlText = await contents.files[kmlFile].async('string');
        processKmlContent(kmlText);
      } else if (fileName.endsWith('.kml')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const kmlText = event.target?.result as string;
          processKmlContent(kmlText);
        };
        reader.readAsText(file);
      } else if (fileName.endsWith('.gpx')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const gpxText = event.target?.result as string;
          processGpxContent(gpxText);
        };
        reader.readAsText(file);
      } else {
        throw new Error("Formato de arquivo não suportado. Use .kml, .kmz ou .gpx");
      }
    } catch (err: any) {
      setError("Erro ao carregar arquivo: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans selection:bg-goinfra-green/20">
      {/* Header */}
      <header className="bg-white border-b-4 border-goinfra-green px-8 py-5 flex items-center justify-between sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="bg-goinfra-green p-2.5 rounded-xl shadow-lg shadow-goinfra-green/20">
            <Navigation className="text-white w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-goinfra-green">Visibilidade Rodoviária</h1>
            </div>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Análise Técnica de Trechos • KML/KMZ/GPX</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-1 mr-4">
            <div className="w-3 h-8 bg-goinfra-green rounded-full" />
            <div className="w-3 h-8 bg-goinfra-yellow rounded-full" />
            <div className="w-3 h-8 bg-goinfra-blue rounded-full" />
          </div>
          <button 
            onClick={() => setShowHelp(true)}
            className="p-2.5 text-slate-400 hover:text-goinfra-green hover:bg-goinfra-green/5 rounded-xl transition-all"
            title="Ajuda com Relevo"
          >
            <HelpCircle className="w-6 h-6" />
          </button>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-lg shadow-slate-200"
          >
            <Upload className="w-4 h-4" />
            Importar Arquivo
          </button>
          {kmlLoaded && (
            <button 
              onClick={() => {
                setPath([]);
                setKmlLoaded(false);
                setObserverIndex(null);
                setElevationStats(null);
                setDistanceToAxis(null);
              }}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-500 px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Limpar
            </button>
          )}
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".kml,.kmz,.gpx" 
            onChange={handleFileUpload}
          />
        </div>
      </header>

      <main className="p-8 max-w-6xl mx-auto space-y-8">
        
        {/* Visibility Parameters Card */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-goinfra-green/10 p-2 rounded-lg">
                <Mountain className="w-5 h-5 text-goinfra-green" />
              </div>
              <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm">Altura do Olho (m)</h3>
            </div>
            <input 
              type="number" 
              step="0.01"
              value={draftEyeHeight}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setDraftEyeHeight(val);
              }}
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-goinfra-green/10 focus:border-goinfra-green outline-none transition-all font-mono text-lg"
            />
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Padrão DNIT: 1.20m</p>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-goinfra-green/10 p-2 rounded-lg">
                <Target className="w-5 h-5 text-goinfra-green" />
              </div>
              <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm">Altura do Objeto (m)</h3>
            </div>
            <input 
              type="number" 
              step="0.01"
              value={draftObjectHeight}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setDraftObjectHeight(val);
              }}
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-goinfra-green/10 focus:border-goinfra-green outline-none transition-all font-mono text-lg"
            />
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Padrão DNIT: 0.15m ou 0.60m</p>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-goinfra-green/10 p-2 rounded-lg">
                <Route className="w-5 h-5 text-goinfra-green" />
              </div>
              <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm">Afast. Lateral Livre (m)</h3>
            </div>
            <input 
              type="number" 
              step="0.1"
              value={draftLateralOffset}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setDraftLateralOffset(val);
              }}
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-goinfra-green/10 focus:border-goinfra-green outline-none transition-all font-mono text-lg"
            />
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Visibilidade Horizontal (Planta)</p>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-amber-500/10 p-2 rounded-lg">
                <Zap className="w-5 h-5 text-amber-600" />
              </div>
              <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm">Velocidade da Via (km/h)</h3>
            </div>
            <input 
              type="number" 
              value={draftSpeedLimit}
              onChange={(e) => setDraftSpeedLimit(parseInt(e.target.value) || 0)}
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all font-mono text-lg"
            />
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">DVP Recomendada: {(draftSpeedLimit * 2.5).toFixed(0)}m</p>
          </div>
        </div>

        {/* Action Buttons for Parameters */}
        <div className="flex flex-wrap gap-4 mb-12 justify-center">
          <button
            onClick={handleApplyParameters}
            className="flex items-center gap-3 px-8 py-4 bg-goinfra-green text-white rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl shadow-goinfra-green/20 hover:bg-goinfra-green-light transition-all active:scale-95"
          >
            <CheckCircle2 className="w-5 h-5" />
            Confirmar Alterações
          </button>
          <button
            onClick={handleResetParameters}
            className="flex items-center gap-3 px-8 py-4 bg-white text-slate-600 border border-slate-200 rounded-2xl font-black uppercase tracking-widest text-sm shadow-lg hover:bg-slate-50 transition-all active:scale-95"
          >
            <RefreshCw className="w-5 h-5" />
            Resetar para Padrões
          </button>
        </div>

        {/* KML Status & UTM Input Card */}
        <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/60 border border-slate-100 overflow-hidden">
          <div className="bg-slate-900 p-10 text-white relative overflow-hidden">
            <div className="relative z-10 flex items-center justify-between gap-8">
              <div className="flex-1">
                <h2 className="text-3xl font-black mb-3">Localização do Observador</h2>
                <p className="text-slate-400 text-base max-w-md">
                  {kmlLoaded 
                    ? "Defina a posição do observador usando coordenadas UTM para calcular a visibilidade no trecho." 
                    : "Importe um arquivo ou clique no mapa para gerar um trecho automático de 4km."}
                </p>
              </div>
              
              {kmlLoaded && elevationStats && (
                <div className="flex flex-col gap-3">
                  <motion.div 
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    className={cn(
                      "px-6 py-3 rounded-2xl border flex items-center gap-3",
                      elevationStats.hasZ 
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                        : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    )}
                  >
                    {elevationStats.hasZ ? <CheckCircle2 className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
                    <div className="text-left">
                      <span className="text-[10px] font-black uppercase tracking-widest block">Status do Relevo</span>
                      <span className="text-sm font-bold">{elevationStats.hasZ ? "Altitude Detectada" : "Sem Altitude (2D)"}</span>
                    </div>
                  </motion.div>
                  
                  {!elevationStats.hasZ && (
                    <motion.button
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      onClick={fetchElevationData}
                      disabled={loading}
                      className="bg-goinfra-green hover:bg-goinfra-green-light text-white px-6 py-3 rounded-2xl flex items-center gap-3 font-black text-xs uppercase tracking-widest shadow-lg shadow-goinfra-green/20 transition-all"
                    >
                      {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                      Corrigir Relevo Agora
                    </motion.button>
                  )}
                  
                  {elevationStats.hasZ && (
                    <motion.div 
                      initial={{ x: 20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: 0.1 }}
                      className="bg-goinfra-green/10 text-goinfra-green px-6 py-3 rounded-2xl border border-goinfra-green/20 flex items-center gap-3"
                    >
                      <Mountain className="w-6 h-6" />
                      <div className="text-left">
                        <span className="text-[10px] font-black uppercase tracking-widest block">Variação</span>
                        <span className="text-sm font-bold">{Math.round(elevationStats.min)}m a {Math.round(elevationStats.max)}m</span>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}
            </div>
            <MapIcon className="absolute -right-12 -bottom-12 w-64 h-64 text-white/5 rotate-12" />
          </div>

          {/* File Summary Section */}
          <AnimatePresence>
            {kmlLoaded && path.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="px-10 py-8 bg-slate-50/50 border-b border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-6"
              >
                <div className="flex items-center gap-4">
                  <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-100">
                    <Route className="w-5 h-5 text-goinfra-green" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Traçado Lido</p>
                    <p className={cn("font-bold", path.length < 2 ? "text-amber-600" : "text-slate-700")}>
                      {path.length === 1 ? "Apenas 1 ponto (Não é um trajeto)" : `${path.length} pontos encontrados`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-100">
                    <TrendingUp className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="flex flex-col">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Extensão</p>
                    <p className="font-bold text-slate-700">{(path[path.length - 1].distance / 1000).toFixed(2)} km</p>
                    {path.length > 2 && (path[path.length-1].distance / path.length > 100) && (
                      <button 
                        onClick={(e) => { e.preventDefault(); densifyPath(); }}
                        className="text-[9px] text-amber-600 font-bold flex items-center gap-1 hover:underline bg-amber-50 px-2 py-0.5 rounded-full mt-1 w-fit"
                      >
                        <Wand2 className="w-3 h-3" /> Refinar Traçado (Densificar)
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-100">
                    <MapPin className="w-5 h-5 text-slate-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Início do Trecho</p>
                    <p className="font-bold text-slate-700 text-xs truncate max-w-[180px]">
                      {path[0].lat.toFixed(5)}, {path[0].lng.toFixed(5)}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Map Section */}
          <div className="h-[400px] bg-slate-100 relative overflow-hidden">
            {!kmlLoaded ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-10 text-center">
                <MapIcon className="w-16 h-16 mb-4 opacity-20" />
                <p className="font-bold uppercase tracking-widest text-xs">O mapa aparecerá aqui após o upload</p>
              </div>
            ) : (
              <MapContainer 
                center={[path[0].lat, path[0].lng]} 
                zoom={13} 
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom={true}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Polyline 
                  positions={path.map(p => [p.lat, p.lng])} 
                  pathOptions={{ color: '#64748b', weight: 4, opacity: 0.6 }} 
                />
                
                {visibility && path[visibility.observerIndex] && (
                  <>
                    {/* Visible Path Segment */}
                    <Polyline 
                      positions={path.slice(
                        Math.max(0, visibility.observerIndex - Math.floor(visibility.decreasing / (path[1]?.distance - path[0]?.distance || 1))),
                        Math.min(path.length, visibility.observerIndex + Math.floor(visibility.increasing / (path[1]?.distance - path[0]?.distance || 1)))
                      ).map(p => [p.lat, p.lng])} 
                      pathOptions={{ color: '#10b981', weight: 6, opacity: 1 }} 
                    />
                    
                    {/* Observer Marker */}
                    <Marker position={[path[visibility.observerIndex].lat, path[visibility.observerIndex].lng]}>
                      <Popup>
                        <div className="font-sans p-2">
                          <p className="font-black text-goinfra-green text-sm">Ponto X (Intervenção)</p>
                          <p className="text-xs font-bold text-slate-600 mt-1">{formatKm(path[visibility.observerIndex].distance)}</p>
                          <div className="mt-3 flex flex-col gap-2">
                            <button 
                              onClick={() => {
                                const lat = path[visibility.observerIndex].lat;
                                const lng = path[visibility.observerIndex].lng;
                                window.open(`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`, '_blank');
                              }}
                              className="flex items-center gap-2 px-3 py-2 bg-slate-900 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-colors"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Google Street View
                            </button>
                          </div>
                        </div>
                      </Popup>
                    </Marker>

                    {/* Line of Sight - Increasing */}
                    {path[visibility.increasingTargetIndex] && (
                      <>
                        <Polyline 
                          positions={[
                            [path[visibility.observerIndex].lat, path[visibility.observerIndex].lng],
                            [path[visibility.increasingTargetIndex].lat, path[visibility.increasingTargetIndex].lng]
                          ]}
                          pathOptions={{ color: '#006b3f', weight: 2, dashArray: '5, 10', opacity: 0.8 }}
                        />
                        <Marker position={[path[visibility.increasingTargetIndex].lat, path[visibility.increasingTargetIndex].lng]}>
                          <Popup>Alvo Crescente</Popup>
                        </Marker>
                      </>
                    )}

                    {/* Line of Sight - Decreasing */}
                    {path[visibility.decreasingTargetIndex] && (
                      <>
                        <Polyline 
                          positions={[
                            [path[visibility.observerIndex].lat, path[visibility.observerIndex].lng],
                            [path[visibility.decreasingTargetIndex].lat, path[visibility.decreasingTargetIndex].lng]
                          ]}
                          pathOptions={{ color: '#f9d71c', weight: 2, dashArray: '5, 10', opacity: 0.8 }}
                        />
                        <Marker position={[path[visibility.decreasingTargetIndex].lat, path[visibility.decreasingTargetIndex].lng]}>
                          <Popup>Alvo Decrescente</Popup>
                        </Marker>
                      </>
                    )}
                  </>
                )}
                
                <MapClickHandler />
                <MapAutoCenter path={path} />
              </MapContainer>
            )}
            
            {kmlLoaded && (
              <div className="absolute top-4 right-4 z-[1000] bg-white/90 backdrop-blur px-4 py-2 rounded-full shadow-lg border border-white/20 flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Clique no mapa para calcular</span>
              </div>
            )}
          </div>

          <div className="border-b border-slate-100 flex overflow-x-auto no-scrollbar">
            <button 
              onClick={() => setCoordFormat('utm')}
              className={cn(
                "px-10 py-6 font-black text-sm uppercase tracking-widest transition-all border-b-4",
                coordFormat === 'utm' ? "border-goinfra-green text-goinfra-green bg-goinfra-green/5" : "border-transparent text-slate-400 hover:text-slate-600"
              )}
            >
              UTM (E/N)
            </button>
            <button 
              onClick={() => setCoordFormat('dd')}
              className={cn(
                "px-10 py-6 font-black text-sm uppercase tracking-widest transition-all border-b-4",
                coordFormat === 'dd' ? "border-goinfra-green text-goinfra-green bg-goinfra-green/5" : "border-transparent text-slate-400 hover:text-slate-600"
              )}
            >
              Graus Decimais
            </button>
            <button 
              onClick={() => setCoordFormat('dms')}
              className={cn(
                "px-10 py-6 font-black text-sm uppercase tracking-widest transition-all border-b-4",
                coordFormat === 'dms' ? "border-goinfra-green text-goinfra-green bg-goinfra-green/5" : "border-transparent text-slate-400 hover:text-slate-600"
              )}
            >
              Graus Min Seg (GMS)
            </button>
          </div>

          <form onSubmit={handleCoordSubmit} className="p-10">
            <AnimatePresence mode="wait">
              {coordFormat === 'utm' && (
                <motion.div 
                  key="utm"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="grid grid-cols-1 md:grid-cols-4 gap-8"
                >
                  <div className="space-y-3">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Easting (X)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      placeholder="Ex: 527123"
                      value={utmEasting}
                      onChange={(e) => setUtmEasting(e.target.value)}
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-mono text-lg"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Northing (Y)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      placeholder="Ex: 8154321"
                      value={utmNorthing}
                      onChange={(e) => setUtmNorthing(e.target.value)}
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-mono text-lg"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Zona UTM</label>
                    <select 
                      value={utmZone}
                      onChange={(e) => setUtmZone(e.target.value)}
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-bold text-lg appearance-none cursor-pointer"
                    >
                      <option value="21">21</option>
                      <option value="22">22 (Goiás Oeste)</option>
                      <option value="23">23 (Goiás Leste)</option>
                      <option value="24">24</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button 
                      type="submit"
                      disabled={loading || !kmlLoaded || path.length < 2}
                      className="w-full bg-goinfra-green hover:bg-goinfra-green-light disabled:bg-slate-100 disabled:text-slate-400 text-white font-black py-4 px-8 rounded-2xl shadow-xl shadow-goinfra-green/20 transition-all flex items-center justify-center gap-3 group"
                    >
                      {loading ? <RefreshCw className="w-6 h-6 animate-spin" /> : <Calculator className="w-6 h-6 group-hover:scale-110 transition-transform" />}
                      Localizar
                    </button>
                  </div>
                </motion.div>
              )}

              {coordFormat === 'dd' && (
                <motion.div 
                  key="dd"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="grid grid-cols-1 md:grid-cols-3 gap-8"
                >
                  <div className="space-y-3">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Latitude (Decimal)</label>
                    <input 
                      type="number" 
                      step="0.000001"
                      placeholder="Ex: -16.678912"
                      value={ddLat}
                      onChange={(e) => setDdLat(e.target.value)}
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-goinfra-green/10 focus:border-goinfra-green outline-none transition-all font-mono text-lg"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Longitude (Decimal)</label>
                    <input 
                      type="number" 
                      step="0.000001"
                      placeholder="Ex: -49.253812"
                      value={ddLng}
                      onChange={(e) => setDdLng(e.target.value)}
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-goinfra-green/10 focus:border-goinfra-green outline-none transition-all font-mono text-lg"
                    />
                  </div>
                  <div className="flex items-end">
                    <button 
                      type="submit"
                      disabled={loading || !kmlLoaded || path.length < 2}
                      className="w-full bg-goinfra-green hover:bg-goinfra-green-light disabled:bg-slate-100 disabled:text-slate-400 text-white font-black py-4 px-8 rounded-2xl shadow-xl shadow-goinfra-green/20 transition-all flex items-center justify-center gap-3 group"
                    >
                      {loading ? <RefreshCw className="w-6 h-6 animate-spin" /> : <Calculator className="w-6 h-6 group-hover:scale-110 transition-transform" />}
                      Localizar
                    </button>
                  </div>
                </motion.div>
              )}

              {coordFormat === 'dms' && (
                <motion.div 
                  key="dms"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="space-y-8"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Latitude DMS */}
                    <div className="space-y-3">
                      <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Latitude (GMS)</label>
                      <div className="flex gap-2">
                        <input type="number" placeholder="G" value={dmsLatDeg} onChange={(e) => setDmsLatDeg(e.target.value)} className="w-full px-3 py-4 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono" />
                        <input type="number" placeholder="M" value={dmsLatMin} onChange={(e) => setDmsLatMin(e.target.value)} className="w-full px-3 py-4 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono" />
                        <input type="number" step="0.01" placeholder="S" value={dmsLatSec} onChange={(e) => setDmsLatSec(e.target.value)} className="w-full px-3 py-4 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono" />
                        <select value={dmsLatDir} onChange={(e) => setDmsLatDir(e.target.value as 'N' | 'S')} className="px-3 py-4 bg-slate-50 border border-slate-200 rounded-xl font-bold">
                          <option value="N">N</option>
                          <option value="S">S</option>
                        </select>
                      </div>
                    </div>
                    {/* Longitude DMS */}
                    <div className="space-y-3">
                      <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Longitude (GMS)</label>
                      <div className="flex gap-2">
                        <input type="number" placeholder="G" value={dmsLngDeg} onChange={(e) => setDmsLngDeg(e.target.value)} className="w-full px-3 py-4 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono" />
                        <input type="number" placeholder="M" value={dmsLngMin} onChange={(e) => setDmsLngMin(e.target.value)} className="w-full px-3 py-4 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono" />
                        <input type="number" step="0.01" placeholder="S" value={dmsLngSec} onChange={(e) => setDmsLngSec(e.target.value)} className="w-full px-3 py-4 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono" />
                        <select value={dmsLngDir} onChange={(e) => setDmsLngDir(e.target.value as 'E' | 'W')} className="px-3 py-4 bg-slate-50 border border-slate-200 rounded-xl font-bold">
                          <option value="E">E</option>
                          <option value="W">W</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button 
                      type="submit"
                      disabled={loading || !kmlLoaded || path.length < 2}
                      className="w-full md:w-auto bg-goinfra-green hover:bg-goinfra-green-light disabled:bg-slate-100 disabled:text-slate-400 text-white font-black py-4 px-12 rounded-2xl shadow-xl shadow-goinfra-green/20 transition-all flex items-center justify-center gap-3 group"
                    >
                      {loading ? <RefreshCw className="w-6 h-6 animate-spin" /> : <Calculator className="w-6 h-6 group-hover:scale-110 transition-transform" />}
                      Localizar
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Precision Feedback */}
            <AnimatePresence>
              {distanceToAxis !== null && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-8 overflow-hidden"
                >
                  <div className={cn(
                    "p-6 rounded-3xl border flex items-center justify-between gap-4",
                    distanceToAxis < 1 ? "bg-emerald-50 border-emerald-100 text-emerald-800" :
                    distanceToAxis < 20 ? "bg-goinfra-green/5 border-goinfra-green/10 text-goinfra-green" :
                    "bg-amber-50 border-amber-100 text-amber-800"
                  )}>
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "p-3 rounded-2xl",
                        distanceToAxis < 1 ? "bg-emerald-500 text-white" :
                        distanceToAxis < 20 ? "bg-goinfra-green text-white" :
                        "bg-amber-500 text-white"
                      )}>
                        {distanceToAxis < 1 ? <CheckCircle2 className="w-6 h-6" /> : 
                         distanceToAxis < 20 ? <LocateFixed className="w-6 h-6" /> : 
                         <AlertTriangle className="w-6 h-6" />}
                      </div>
                      <div>
                        <p className="text-sm font-black uppercase tracking-widest opacity-60">Precisão da Localização</p>
                        <p className="text-lg font-bold">
                          {distanceToAxis < 1 ? "Aproximação Perfeita (< 1m)" : 
                           distanceToAxis < 20 ? `Ponto a ${distanceToAxis.toFixed(2)}m do eixo` :
                           `Atenção: Ponto a ${distanceToAxis.toFixed(2)}m do eixo`}
                        </p>
                      </div>
                    </div>
                    {distanceToAxis >= 20 && (
                      <div className="max-w-xs text-right">
                        <p className="text-xs font-bold leading-relaxed">
                          O ponto informado está distante do traçado. Verifique se as coordenadas UTM e a Zona estão corretas para este trecho.
                        </p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </form>
        </div>

        {/* Safety Analysis Section */}
        {visibility && path[visibility.observerIndex] && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-900 rounded-[2.5rem] p-10 text-white shadow-2xl border border-white/10"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="bg-goinfra-green p-2 rounded-lg">
                    <ShieldCheck className="w-6 h-6 text-white" />
                  </div>
                  <h2 className="text-2xl font-black uppercase tracking-widest">Relatório de Segurança (Ponto X)</h2>
                </div>
                <div className="flex flex-wrap gap-4">
                  <div className="bg-white/5 px-4 py-2 rounded-xl border border-white/10">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Localização</p>
                    <p className="text-lg font-bold">{formatKm(path[visibility.observerIndex].distance)}</p>
                  </div>
                  <div className="bg-white/5 px-4 py-2 rounded-xl border border-white/10">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">DVP Recomendada ({speedLimit} km/h)</p>
                    <p className="text-lg font-bold text-emerald-400">{(speedLimit * 2.5).toFixed(0)}m</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: 'Visib. Crescente', value: visibility.increasing, dir: 'Crescente' },
                  { label: 'Visib. Decrescente', value: visibility.decreasing, dir: 'Decrescente' }
                ].map((item) => {
                  const goodThreshold = speedLimit * 2.5;
                  const attentionThreshold = speedLimit * 1.875;
                  
                  let status: 'good' | 'attention' | 'danger' = 'danger';
                  if (item.value >= goodThreshold) status = 'good';
                  else if (item.value >= attentionThreshold) status = 'attention';

                  return (
                    <div key={item.label} className={cn(
                      "p-6 rounded-3xl border transition-all",
                      status === 'good' ? "bg-emerald-500/10 border-emerald-500/30" : 
                      status === 'attention' ? "bg-amber-500/10 border-amber-500/30" : 
                      "bg-red-500/10 border-red-500/30"
                    )}>
                      <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">{item.label}</p>
                      <div className="flex items-center gap-3">
                        <span className="text-3xl font-black">{Math.round(item.value)}m</span>
                        {status === 'good' ? (
                          <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                        ) : status === 'attention' ? (
                          <AlertTriangle className="w-6 h-6 text-amber-400" />
                        ) : (
                          <AlertTriangle className="w-6 h-6 text-red-400" />
                        )}
                      </div>
                      <p className={cn(
                        "text-[10px] font-bold mt-2 uppercase tracking-widest",
                        status === 'good' ? "text-emerald-400" : 
                        status === 'attention' ? "text-amber-400" : 
                        "text-red-400"
                      )}>
                        {status === 'good' ? "Visibilidade Boa" : 
                         status === 'attention' ? "Atenção: Visibilidade Limite" : 
                         "Crítico: Visibilidade Insuficiente"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="mt-8 pt-8 border-t border-white/10 flex flex-col md:flex-row gap-6 items-center justify-between">
              <p className="text-xs text-slate-400 font-medium max-w-2xl">
                Esta análise utiliza o modelo digital de terreno (KML) e o afastamento lateral livre informado para determinar a visibilidade real. 
                Em rodovias existentes, recomenda-se validar obstruções físicas (vegetação, sinalização) via Street View ou vistoria de campo.
              </p>
              <button 
                onClick={() => window.print()}
                className="flex items-center gap-3 px-8 py-4 bg-white text-slate-900 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-slate-100 transition-all"
              >
                <FileText className="w-5 h-5" />
                Gerar Relatório PDF
              </button>
            </div>
          </motion.div>
        )}

        {/* Results Summary Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Increasing Result */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <TrendingUp className="w-32 h-32" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-goinfra-green/10 p-3 rounded-2xl">
                  <TrendingUp className="w-6 h-6 text-goinfra-green" />
                </div>
                <h3 className="font-black text-slate-400 uppercase tracking-[0.2em] text-xs">Sentido Crescente</h3>
              </div>
              <div className="flex flex-col">
                <div className="flex items-baseline gap-3">
                  <span className="text-7xl font-black text-slate-900 tracking-tighter">
                    {visibility ? Math.round(visibility.increasing) : '--'}
                  </span>
                  <span className="text-2xl font-bold text-slate-300">metros</span>
                </div>
                {visibility && path[visibility.increasingTargetIndex] && (
                  <p className="text-xs font-bold text-slate-500 mt-1">
                    Até {formatKm(path[visibility.increasingTargetIndex].distance)}
                  </p>
                )}
              </div>
              {visibility && visibility.increasingLimitingFactor !== 'none' && (
                <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full">
                  <div className={cn("w-2 h-2 rounded-full", visibility.increasingLimitingFactor === 'vertical' ? 'bg-emerald-500' : 'bg-amber-500')} />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Limitado por: {visibility.increasingLimitingFactor === 'vertical' ? 'Relevo (Vertical)' : 'Curva (Horizontal)'}
                  </span>
                </div>
              )}
              <p className="mt-6 text-sm text-slate-400 font-medium leading-relaxed">
                Distância máxima de visibilidade considerando o relevo e curvas no sentido de fluxo crescente.
              </p>
            </div>
          </motion.div>

          {/* Decreasing Result */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
              <TrendingDown className="w-32 h-32" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-goinfra-yellow/10 p-3 rounded-2xl">
                  <TrendingDown className="w-6 h-6 text-goinfra-yellow" />
                </div>
                <h3 className="font-black text-slate-400 uppercase tracking-[0.2em] text-xs">Sentido Decrescente</h3>
              </div>
              <div className="flex flex-col">
                <div className="flex items-baseline gap-3">
                  <span className="text-7xl font-black text-slate-900 tracking-tighter">
                    {visibility ? Math.round(visibility.decreasing) : '--'}
                  </span>
                  <span className="text-2xl font-bold text-slate-300">metros</span>
                </div>
                {visibility && path[visibility.decreasingTargetIndex] && (
                  <p className="text-xs font-bold text-slate-500 mt-1">
                    Até {formatKm(path[visibility.decreasingTargetIndex].distance)}
                  </p>
                )}
              </div>
              {visibility && visibility.decreasingLimitingFactor !== 'none' && (
                <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full">
                  <div className={cn("w-2 h-2 rounded-full", visibility.decreasingLimitingFactor === 'vertical' ? 'bg-emerald-500' : 'bg-amber-500')} />
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Limitado por: {visibility.decreasingLimitingFactor === 'vertical' ? 'Relevo (Vertical)' : 'Curva (Horizontal)'}
                  </span>
                </div>
              )}
              <p className="mt-6 text-sm text-slate-400 font-medium leading-relaxed">
                Distância máxima de visibilidade considerando o relevo e curvas no sentido de fluxo decrescente.
              </p>
            </div>
          </motion.div>
        </div>

        {/* Elevation Profile Chart */}
        <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/40 border border-slate-100 p-10">
          <div className="flex items-center justify-between mb-10">
            <h3 className="text-xl font-black text-slate-800 flex items-center gap-4">
              <div className="bg-slate-50 p-3 rounded-2xl">
                <TrendingUp className="w-6 h-6 text-blue-500" />
              </div>
              Perfil Altitudinal do Trecho
            </h3>
            <div className="flex items-center gap-6">
              <div className="hidden lg:flex items-center gap-2 bg-goinfra-green/10 px-4 py-2 rounded-xl border border-goinfra-green/20">
                <Info className="w-4 h-4 text-goinfra-green" />
                <span className="text-[10px] font-black text-goinfra-green uppercase tracking-widest">Dica: Clique no gráfico para mudar a posição</span>
              </div>
              {path.length > 0 && (
                <div className="bg-slate-50 px-6 py-3 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Extensão Total</p>
                  <p className="font-black text-slate-700 text-lg">{Math.round(path[path.length - 1].distance)}m</p>
                </div>
              )}
            </div>
          </div>
          
          <div className="h-[350px] w-full">
            {path.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart 
                  data={path}
                  onClick={(data) => {
                    if (data && data.activeLabel) {
                      findClosestPointByDistance(Number(data.activeLabel));
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <defs>
                    <linearGradient id="colorElev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#006b3f" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#006b3f" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    type="number"
                    dataKey="distance" 
                    tickFormatter={(val) => `${Math.round(val)}m`}
                    fontSize={11}
                    fontWeight={700}
                    tick={{fill: '#94a3b8'}}
                    axisLine={false}
                    tickLine={false}
                    dy={10}
                    domain={[0, 'dataMax']}
                  />
                  <YAxis 
                    fontSize={11}
                    fontWeight={700}
                    tick={{fill: '#94a3b8'}}
                    axisLine={false}
                    tickLine={false}
                    domain={['auto', 'auto']}
                    tickFormatter={(val) => `${Math.round(val)}m`}
                    dx={-10}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)', padding: '20px' }}
                    formatter={(val: any) => [`${val.toFixed(2)}m`, 'Elevação']}
                    labelFormatter={(label: any) => `Distância: ${Math.round(label)}m`}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="elevation" 
                    stroke="#006b3f" 
                    strokeWidth={4}
                    fillOpacity={1} 
                    fill="url(#colorElev)" 
                    animationDuration={2000}
                  />
                  {observerIndex !== null && path[observerIndex] && (
                    <>
                      <ReferenceLine 
                        x={path[observerIndex].distance} 
                        stroke="#ef4444" 
                        strokeDasharray="3 3" 
                        strokeWidth={2}
                        label={{ value: 'Observador', position: 'top', fill: '#ef4444', fontSize: 10, fontWeight: 'bold' }}
                      />
                      <ReferenceDot 
                        x={path[observerIndex].distance} 
                        y={path[observerIndex].elevation} 
                        r={8} 
                        fill="#ef4444" 
                        stroke="#fff" 
                        strokeWidth={3}
                        isFront={true}
                      />
                      
                      {/* Line of Sight - Increasing */}
                      {visibility && path[visibility.increasingTargetIndex] && (
                        <>
                          <ReferenceLine
                            segment={[
                              { x: path[observerIndex].distance, y: path[observerIndex].elevation + eyeHeight },
                              { x: path[visibility.increasingTargetIndex].distance, y: path[visibility.increasingTargetIndex].elevation + objectHeight }
                            ]}
                            stroke="#006b3f"
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            label={{ value: 'LOS Crescente', position: 'insideTopRight', fill: '#006b3f', fontSize: 9, fontWeight: 'bold' }}
                          />
                          <ReferenceDot
                            x={path[visibility.increasingTargetIndex].distance}
                            y={path[visibility.increasingTargetIndex].elevation + objectHeight}
                            r={4}
                            fill="#006b3f"
                            stroke="#fff"
                            strokeWidth={2}
                          />
                        </>
                      )}

                      {/* Line of Sight - Decreasing */}
                      {visibility && path[visibility.decreasingTargetIndex] && (
                        <>
                          <ReferenceLine
                            segment={[
                              { x: path[observerIndex].distance, y: path[observerIndex].elevation + eyeHeight },
                              { x: path[visibility.decreasingTargetIndex].distance, y: path[visibility.decreasingTargetIndex].elevation + objectHeight }
                            ]}
                            stroke="#f9d71c"
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            label={{ value: 'LOS Decrescente', position: 'insideTopLeft', fill: '#f9d71c', fontSize: 9, fontWeight: 'bold' }}
                          />
                          <ReferenceDot
                            x={path[visibility.decreasingTargetIndex].distance}
                            y={path[visibility.decreasingTargetIndex].elevation + objectHeight}
                            r={4}
                            fill="#f9d71c"
                            stroke="#fff"
                            strokeWidth={2}
                          />
                        </>
                      )}
                    </>
                  )}

                  {/* Direction Labels */}
                  <ReferenceLine x={0} stroke="transparent" label={{ value: '← DECRESCENTE', position: 'insideBottomLeft', fill: '#f9d71c', fontSize: 10, fontWeight: 'black', dy: -20 }} />
                  {path.length > 0 && (
                    <ReferenceLine x={path[path.length - 1].distance} stroke="transparent" label={{ value: 'CRESCENTE →', position: 'insideBottomRight', fill: '#006b3f', fontSize: 10, fontWeight: 'black', dy: -20 }} />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 border-4 border-dashed border-slate-50 rounded-[2rem] bg-slate-50/30">
                <Upload className="w-16 h-16 mb-6 opacity-20" />
                <p className="font-black text-lg uppercase tracking-widest opacity-40">Importe um KML, KMZ ou GPX para visualizar</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Help Modal */}
      <AnimatePresence>
        {showHelp && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHelp(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="bg-slate-900 p-8 text-white flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-goinfra-green p-2 rounded-xl">
                    <HelpCircle className="w-6 h-6" />
                  </div>
                  <h2 className="text-2xl font-black">Guia de Relevo</h2>
                </div>
                <button onClick={() => setShowHelp(false)} className="p-2 hover:bg-white/10 rounded-xl transition-all">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-8 space-y-8 overflow-y-auto max-h-[70vh]">
                <section className="space-y-4">
                  <h3 className="text-lg font-black text-slate-800 flex items-center gap-3">
                    <div className="w-2 h-8 bg-indigo-600 rounded-full" />
                    Dica Pro: Trechos Perfeitos (Sem desenhar)
                  </h3>
                  <p className="text-slate-600 leading-relaxed">
                    Para evitar erros de "distância do eixo" e ter curvas perfeitas, não desenhe na mão. Use o <strong>Roteamento Automático</strong>:
                  </p>
                  <ul className="list-disc list-inside space-y-2 text-slate-600 ml-2">
                    <li>No <a href="https://gpx.studio/" target="_blank" className="text-goinfra-green font-bold hover:underline">gpx.studio</a>, use a ferramenta de <strong>Roteamento</strong> (ícone de carro).</li>
                    <li>Clique no início e fim: ele "grudará" a linha na estrada automaticamente.</li>
                    <li>Vá em <strong>Edit {'>'} Resample</strong> e defina <strong>20m</strong>. Isso cria pontos frequentes e aumenta muito a precisão do cálculo.</li>
                  </ul>
                </section>

                <section className="space-y-4">
                  <h3 className="text-lg font-black text-slate-800 flex items-center gap-3">
                    <div className="w-2 h-8 bg-goinfra-green rounded-full" />
                    Opção 1: Corrigir Relevo no Programa
                  </h3>
                  <p className="text-slate-600 leading-relaxed">
                    Se o seu arquivo não tem altitude, use o botão <strong>"Corrigir Relevo Agora"</strong> que aparece logo após a importação. Nós buscaremos os dados de satélite automaticamente para você.
                  </p>
                </section>

                <section className="space-y-4">
                  <h3 className="text-lg font-black text-slate-800 flex items-center gap-3">
                    <div className="w-2 h-8 bg-emerald-600 rounded-full" />
                    Opção 2: Usar o gpx.studio (Online)
                  </h3>
                  <p className="text-slate-600 leading-relaxed">
                    A ferramenta gratuita mais poderosa para isso. Siga os passos:
                  </p>
                  <ol className="list-decimal list-inside space-y-2 text-slate-600 ml-2">
                    <li>Acesse <a href="https://gpx.studio/" target="_blank" className="text-goinfra-green font-bold hover:underline inline-flex items-center gap-1">gpx.studio <ExternalLink className="w-3 h-3" /></a></li>
                    <li>Suba seu arquivo (KML, KMZ ou GPX)</li>
                    <li>Clique no ícone de <strong>Montanha</strong> (Add elevation)</li>
                    <li>Clique em <strong>Exportar</strong> e salve novamente</li>
                  </ol>
                </section>

                <section className="space-y-4">
                  <h3 className="text-lg font-black text-slate-800 flex items-center gap-3">
                    <div className="w-2 h-8 bg-amber-600 rounded-full" />
                    Opção 3: Google Earth Pro
                  </h3>
                  <p className="text-slate-600 leading-relaxed">
                    Para exportar com altitude direto do Google Earth:
                  </p>
                  <ul className="list-disc list-inside space-y-2 text-slate-600 ml-2">
                    <li>Clique com o botão direito no seu caminho {'>'} <strong>Propriedades</strong></li>
                    <li>Na aba <strong>Altitude</strong>, mude para <strong>"Relativo ao solo"</strong></li>
                    <li>Defina o valor como <strong>1 metro</strong></li>
                    <li>Salve o lugar como KML novamente</li>
                  </ul>
                </section>
              </div>
              
              <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button 
                  onClick={() => setShowHelp(false)}
                  className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-800 transition-all"
                >
                  Entendi
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[200] bg-slate-900 text-white px-8 py-5 rounded-3xl shadow-2xl flex items-center gap-4 border border-white/10"
          >
            <div className="bg-red-500 p-1.5 rounded-lg">
              <Info className="w-5 h-5" />
            </div>
            <span className="font-bold text-sm">{error}</span>
            <button onClick={() => setError(null)} className="ml-6 text-white/30 hover:text-white transition-colors">
              <RefreshCw className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

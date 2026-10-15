import { useMapEvents } from "react-leaflet";

export default function CatalogMapActions({
  onClick,
  onZoom
}: {
  onClick: (lat: number, lon: number) => void;
  onZoom: (zoom: number) => void;
}) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
    zoomend(e) {
      onZoom(e.target.getZoom());
    }
  });

  return null;
}

import { useEffect } from "react";
import { useMap } from "react-leaflet";

export default function SismoiaWorldCamera({
  peru
}: {
  peru: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    const actualizar = () => {
      map.invalidateSize({ pan: false });

      if (peru) {
        map.setView([-9.2, -75], 5, {
          animate: false
        });
      } else {
        map.fitBounds(
          [[-75, -179], [80, 179]],
          {
            padding: [8, 8],
            maxZoom: 2,
            animate: false
          }
        );
      }
    };

    map.whenReady(actualizar);
  }, [map, peru]);

  return null;
}

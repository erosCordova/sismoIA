import { useEffect } from "react";
import { useMap } from "react-leaflet";

type Props = {
  peru: boolean;
};

export default function MapRegionCamera({ peru }: Props) {
  const map = useMap();

  useEffect(() => {
    let cancelado = false;

    map.whenReady(() => {
      if (cancelado) return;

      map.invalidateSize({ pan: false });

      if (peru) {
        map.setView([-9.2, -75], 5, {
          animate: false,
        });
      } else {
        map.fitBounds(
          [
            [-60, -179],
            [83, 179],
          ],
          {
            padding: [12, 12],
            maxZoom: 2,
            animate: false,
          }
        );
      }
    });

    return () => {
      cancelado = true;
    };
  }, [map, peru]);

  return null;
}

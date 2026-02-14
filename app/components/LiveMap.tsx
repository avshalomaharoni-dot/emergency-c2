"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "@/lib/supabaseClient";

type LiveMapProps = {
  eventId: string;
};

type LocationRow = {
  user_id: string;
  lat: number;
  lng: number;
  updated_at: string;
};

export default function LiveMap({ eventId }: LiveMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Record<string, maplibregl.Marker>>({});
  const [ready, setReady] = useState(false);

  // 1) Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;

    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: key
        ? `https://api.maptiler.com/maps/satellite/style.json?key=${key}`
        : "https://demotiles.maplibre.org/style.json",
      center: [35.2137, 31.7683], // Jerusalem
      zoom: 12,
    });

    mapRef.current.addControl(new maplibregl.NavigationControl(), "top-right");
    setReady(true);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = {};
    };
  }, []);

  // 2) Load + realtime subscribe
  useEffect(() => {
    if (!ready || !eventId) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;

    const upsertMarker = (row: LocationRow) => {
      const map = mapRef.current;
      if (!map) return;

      const id = row.user_id;
      const lngLat: [number, number] = [row.lng, row.lat];

      // update existing marker
      if (markersRef.current[id]) {
        markersRef.current[id].setLngLat(lngLat);
        return;
      }

      // create marker
      const el = document.createElement("div");
      el.style.width = "12px";
      el.style.height = "12px";
      el.style.borderRadius = "999px";
      el.style.background = "#2563eb"; // blue
      el.style.border = "2px solid white";
      el.style.boxShadow = "0 2px 8px rgba(0,0,0,0.25)";

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat(lngLat)
        .addTo(map);

      markersRef.current[id] = marker;
    };

    const load = async () => {
      const { data, error } = await supabase
        .from("user_locations")
        .select("user_id,lat,lng,updated_at")
        .eq("event_id", eventId);

      if (!error && data) {
        data.forEach((row) => upsertMarker(row as LocationRow));
      }
    };

    load();

    channel = supabase
      .channel(`realtime:user_locations:${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_locations", filter: `event_id=eq.${eventId}` },
        (payload) => {
          const row = payload.new as LocationRow | null;
          if (row) upsertMarker(row);
        }
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [ready, eventId]);

  return (
    <div className="mt-6 rounded-2xl border bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Live Map</h2>
        <span className="text-xs text-zinc-500">
          {process.env.NEXT_PUBLIC_MAPTILER_KEY ? "Satellite (MapTiler)" : "Demo style (no key)"}
        </span>
      </div>
      <div ref={containerRef} className="h-[420px] w-full overflow-hidden rounded-xl border" />
      <p className="mt-2 text-xs text-zinc-500">
        Showing latest user positions for this event (markers update in realtime).
      </p>
    </div>
  );
}

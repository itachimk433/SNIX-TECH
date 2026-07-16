import React, { useState, useEffect } from "react";
import { Wifi, Battery, Signal } from "lucide-react";

interface PhoneContainerProps {
  children: React.ReactNode;
}

export default function PhoneContainer({ children }: PhoneContainerProps) {
  const [time, setTime] = useState("");
  const [vvHeight, setVvHeight] = useState<number | null>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      let hours = now.getHours();
      const minutes = now.getMinutes().toString().padStart(2, "0");
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12;
      hours = hours ? hours : 12;
      setTime(`${hours}:${minutes} ${ampm}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => setVvHeight(vv.height);
    vv.addEventListener("resize", onResize);
    onResize();
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  return (
    <div
      className="h-screen overflow-hidden select-none font-sans md:min-h-screen md:h-auto md:flex md:items-center md:justify-center md:p-6"
      style={{ backgroundColor: "#080C10" }}
    >
      <div
        className="relative w-full flex flex-col overflow-hidden md:h-[840px] md:w-[420px] md:rounded-[44px] md:shadow-2xl"
        style={{
          height: vvHeight ? `${vvHeight}px` : "100%",
          backgroundColor: "#080C10",
          border: "10px solid #0D1520",
          boxShadow: "0 0 60px rgba(0,212,255,0.08), 0 40px 80px rgba(0,0,0,0.7)",
        }}
      >
        {/* Notch — desktop preview only */}
        <div
          className="hidden md:flex absolute top-0 left-1/2 transform -translate-x-1/2 w-40 h-6 rounded-b-2xl z-50 items-center justify-center"
          style={{ backgroundColor: "#040709" }}
        >
          <div className="w-12 h-1 rounded-full mb-1" style={{ backgroundColor: "#0D1520" }} />
        </div>

        {/* Fake status bar — desktop preview only */}
        <div
          className="hidden md:flex h-10 px-6 justify-between items-center text-xs z-40 select-none"
          style={{ backgroundColor: "#040709", color: "#7A9BB5", borderBottom: "1px solid #1E3A5F" }}
        >
          <span className="font-bold tracking-tight" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#E8F4F8" }}>
            {time || "12:00 PM"}
          </span>
          <div className="flex items-center gap-1.5">
            <Signal size={14} style={{ color: "#00FF88" }} />
            <span className="text-[10px] font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#00D4FF" }}>5G</span>
            <Wifi size={14} style={{ color: "#00D4FF" }} />
            <Battery size={16} style={{ color: "#E8F4F8" }} />
          </div>
        </div>

        <div
          className="flex-1 min-h-0 flex flex-col overflow-hidden relative"
          style={{ backgroundColor: "#080C10" }}
        >
          {children}
        </div>

        {/* Bottom home bar — desktop preview only */}
        <div
          className="hidden md:flex h-5 items-center justify-center z-40"
          style={{ backgroundColor: "#040709", borderTop: "1px solid #1E3A5F" }}
        >
          <div className="w-32 h-1.5 rounded-full" style={{ backgroundColor: "#1E3A5F" }} />
        </div>
      </div>
    </div>
  );
}

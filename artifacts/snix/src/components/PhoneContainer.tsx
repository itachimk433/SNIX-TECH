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
    /*
      On mobile the outer div IS the screen — h-screen overflow-hidden, no
      centering. This is critical: if we used "flex items-center justify-center"
      on all sizes, the phone frame would center inside the taller outer div
      when it shrinks for the keyboard, leaving a white gap below.

      On md+ we switch to the desktop phone-mockup layout.
    */
    <div className="h-screen overflow-hidden bg-white select-none font-sans md:min-h-screen md:h-auto md:bg-slate-100 md:flex md:items-center md:justify-center md:p-6">
      <div
        className="relative w-full bg-white flex flex-col overflow-hidden md:h-[840px] md:w-[420px] md:rounded-[44px] md:shadow-2xl md:border-[10px] md:border-slate-900"
        style={{ height: vvHeight ? `${vvHeight}px` : "100%" }}
      >
        {/* Notch — desktop preview only */}
        <div className="hidden md:flex absolute top-0 left-1/2 transform -translate-x-1/2 w-40 h-6 bg-slate-900 rounded-b-2xl z-50 items-center justify-center">
          <div className="w-12 h-1 bg-slate-800 rounded-full mb-1"></div>
        </div>

        {/* Fake status bar — desktop preview only */}
        <div className="hidden md:flex h-10 bg-slate-900 text-white px-6 justify-between items-center text-xs z-40 select-none">
          <span className="font-semibold tracking-tight">{time || "12:00 PM"}</span>
          <div className="flex items-center gap-1.5">
            <Signal size={14} className="text-emerald-400" />
            <span className="text-[10px] font-bold text-emerald-400">5G</span>
            <Wifi size={14} className="text-blue-400" />
            <Battery size={16} className="text-white fill-white" />
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col bg-slate-50 overflow-hidden relative">
          {children}
        </div>

        {/* Bottom home bar — desktop preview only */}
        <div className="hidden md:flex h-5 bg-white items-center justify-center border-t border-slate-100 z-40">
          <div className="w-32 h-1.5 bg-slate-300 rounded-full"></div>
        </div>
      </div>
    </div>
  );
}

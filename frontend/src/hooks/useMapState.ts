import { useState, useRef } from "react";
import type { SiteSuppliersResponse } from "../types";

/** Map-related state: zoom, hover, selection, dimensions */
export function useMapState() {
  const [zK, setZK] = useState(1);
  const zR = useRef({ k: 1, x: 0, y: 0 });
  const raf = useRef<number | null>(null);
  const [hS, setHS] = useState<number | null>(null);
  const [hD, setHD] = useState<number | null>(null);
  const [hSup, setHSup] = useState<number | null>(null);
  const [selSite, setSelSite] = useState<number | null>(null);
  const [selRt, setSelRt] = useState<number | null>(null);
  const [selSupC, setSelSupC] = useState<number | null>(null);
  const [clickPos, setClickPos] = useState({ x: 0, y: 0 });
  const [dm, setDm] = useState({ w: 1200, h: 700 });
  const svgRef = useRef<SVGSVGElement>(null);
  const gR = useRef<SVGGElement>(null);
  const cR = useRef<HTMLDivElement>(null);
  const [siteSuppliers, setSiteSuppliers] = useState<SiteSuppliersResponse | null>(null);
  const [siteSuppliersLoading, setSiteSuppliersLoading] = useState(false);

  const clearHovers = () => {
    setHS(null);
    setHD(null);
    setHSup(null);
    setSelSite(null);
    setSelRt(null);
    setSelSupC(null);
  };

  return {
    zK, setZK, zR, raf,
    hS, setHS, hD, setHD, hSup, setHSup,
    selSite, setSelSite, selRt, setSelRt, selSupC, setSelSupC,
    clickPos, setClickPos,
    dm, setDm,
    svgRef, gR, cR,
    clearHovers,
    siteSuppliers, setSiteSuppliers,
    siteSuppliersLoading, setSiteSuppliersLoading,
  };
}

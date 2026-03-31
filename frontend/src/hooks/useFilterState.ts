import { useState } from "react";
import { TYPE_CFG, REGION_CFG, BU_CFG } from "../data";
import type { Severity } from "../types";

/** Filter state: type, BU, region, layer toggles, severity/group/assign filters */
export function useFilterState() {
  const [tF, setTF] = useState(() => {
    const f: Record<string, boolean> = {};
    Object.keys(TYPE_CFG).forEach(k => f[k] = true);
    return f;
  });
  const [buF, setBuF] = useState(() => {
    const f: Record<string, boolean> = {};
    Object.keys(BU_CFG).forEach(k => f[k] = true);
    return f;
  });
  const [rF, setRF] = useState(() => {
    const f: Record<string, boolean> = {};
    Object.keys(REGION_CFG).forEach(k => f[k] = true);
    return f;
  });
  const [sR, setSR] = useState(true);
  const [sC, setSC] = useState(true);
  const [fO, setFO] = useState(false);
  const [sSup, setSSup] = useState(true);
  const [sevFilter, setSevFilter] = useState<Severity | null>(null);
  const [groupBy, setGroupBy] = useState<'severity' | 'region'>('severity');
  const [assignFilter, setAssignFilter] = useState<string | null>(null);

  return {
    tF, setTF, buF, setBuF, rF, setRF,
    sR, setSR, sC, setSC, fO, setFO, sSup, setSSup,
    sevFilter, setSevFilter, groupBy, setGroupBy,
    assignFilter, setAssignFilter,
  };
}

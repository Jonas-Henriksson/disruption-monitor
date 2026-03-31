// TopoJSON to GeoJSON converter (lightweight, no dependency on topojson-client)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function topoToGeo(topo: any, name: string) {
  const tf = topo.transform;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dec = topo.arcs.map((a: any) => {
    let x = 0, y = 0;
    return a.map(([dx, dy]: [number, number]) => {
      x += dx; y += dy;
      return [x * tf.scale[0] + tf.translate[0], y * tf.scale[1] + tf.translate[1]];
    });
  });

  const da = (i: number) => i < 0 ? dec[~i].slice().reverse() : dec[i].slice();

  const ring = (ids: number[]) => {
    const c: number[][] = [];
    ids.forEach(i => {
      const a = da(i);
      a.forEach((p: number[], j: number) => { if (j > 0 || !c.length) c.push(p); });
    });
    return c;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dg = (g: any) => {
    if (g.type === 'Polygon') return { type: 'Polygon', coordinates: g.arcs.map(ring) };
    if (g.type === 'MultiPolygon') return { type: 'MultiPolygon', coordinates: g.arcs.map((a: number[][]) => a.map(ring)) };
    return g;
  };

  const obj = topo.objects[name];
  if (obj.type === 'GeometryCollection') {
    return {
      type: 'FeatureCollection',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      features: obj.geometries.map((g: any) => ({
        type: 'Feature',
        id: g.id,
        geometry: dg(g),
        properties: g.properties || {},
      })),
    };
  }
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: dg(obj), properties: {} }],
  };
}

// Country name mapping for map labels (ISO numeric → display name)
export const COUNTRY_NAMES: Record<string, string> = {
  // Americas
  '840':'USA','76':'Brazil','32':'Argentina','124':'Canada','484':'Mexico','152':'Chile','170':'Colombia','604':'Peru','858':'Uruguay','600':'Paraguay','68':'Bolivia','218':'Ecuador','862':'Venezuela','328':'Guyana','740':'Suriname','591':'Panama','188':'Costa Rica','320':'Guatemala','340':'Honduras','222':'El Salvador','558':'Nicaragua','192':'Cuba','214':'Dominican Rep.','388':'Jamaica','780':'Trinidad',
  // Europe
  '826':'UK','250':'France','276':'Germany','380':'Italy','724':'Spain','620':'Portugal','56':'Belgium','528':'Netherlands','756':'Switzerland','40':'Austria','616':'Poland','203':'Czechia','642':'Romania','100':'Bulgaria','804':'Ukraine','643':'Russia','792':'Turkey','300':'Greece','348':'Hungary','752':'Sweden','578':'Norway','246':'Finland','208':'Denmark',
  '372':'Ireland','440':'Lithuania','428':'Latvia','233':'Estonia','112':'Belarus','498':'Moldova','703':'Slovakia','705':'Slovenia','191':'Croatia','70':'Bosnia','688':'Serbia','807':'N. Macedonia','8':'Albania','499':'Montenegro','442':'Luxembourg',
  // Asia
  '356':'India','156':'China','392':'Japan','410':'S. Korea','408':'N. Korea','360':'Indonesia','458':'Malaysia','764':'Thailand','704':'Vietnam','608':'Philippines','702':'Singapore','158':'Taiwan','496':'Mongolia','398':'Kazakhstan','860':'Uzbekistan','795':'Turkmenistan','417':'Kyrgyzstan','762':'Tajikistan','4':'Afghanistan','586':'Pakistan','50':'Bangladesh','144':'Sri Lanka','104':'Myanmar','418':'Laos','116':'Cambodia','524':'Nepal',
  // Middle East & Africa
  '818':'Egypt','682':'Saudi Arabia','784':'UAE','364':'Iran','368':'Iraq','376':'Israel','400':'Jordan','760':'Syria','422':'Lebanon','275':'Palestine','512':'Oman','887':'Yemen','414':'Kuwait','634':'Qatar','48':'Bahrain',
  '710':'South Africa','566':'Nigeria','404':'Kenya','504':'Morocco','12':'Algeria','788':'Tunisia','288':'Ghana','894':'Zambia','834':'Tanzania','800':'Uganda','180':'DR Congo','178':'Congo','24':'Angola','508':'Mozambique','716':'Zimbabwe','72':'Botswana','516':'Namibia','450':'Madagascar','384':'Ivory Coast','686':'Senegal','466':'Mali','562':'Niger','148':'Chad','736':'Sudan','728':'S. Sudan','232':'Eritrea','231':'Ethiopia','706':'Somalia','430':'Liberia','694':'Sierra Leone','854':'Burkina Faso','324':'Guinea','204':'Benin','768':'Togo','120':'Cameroon','266':'Gabon',
  // Oceania
  '36':'Australia','554':'New Zealand','598':'Papua New Guinea',
};

// Manual centroid overrides for countries where d3.geoCentroid is wrong (overseas territories etc)
export const CENTROID_OVERRIDES: Record<string, [number, number]> = {
  '250':[2.2,46.2],'840':[-98.5,39.5],'124':[-96.8,56.0],'643':[90.0,62.0],
  '578':[15.0,65.0],'752':[16.0,63.0],'246':[26.0,64.0],
  '528':[5.3,52.1],'56':[4.4,50.5],'756':[8.2,46.8],'442':[6.1,49.6],
  '208':[9.5,56.0],'372':[-8.0,53.4],'233':[25.0,58.6],'428':[24.1,56.9],'440':[23.9,55.2],
  '376':[34.8,31.5],'422':[35.9,33.9],'400':[36.8,31.2],
  '48':[50.5,26.0],'634':[51.2,25.3],'414':[47.5,29.3],
  '703':[19.7,48.7],'705':[14.8,46.1],'191':[16.4,45.1],'70':[17.8,44.0],
  '807':[21.7,41.5],'8':[20.1,41.0],'499':[19.3,42.7],'688':[20.9,44.0],
  '156':[104.0,35.0],'392':[138.0,37.0],'410':[127.8,36.0],
  '360':[118.0,-2.0],'458':[109.0,4.0],'764':[101.0,15.0],'104':[96.5,19.8],
  '50':[90.3,23.7],'144':[80.7,7.9],'524':[84.1,28.4],
  '554':[172.0,-42.0],'36':[134.0,-25.0],
};

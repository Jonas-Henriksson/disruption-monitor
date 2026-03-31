import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import * as d3 from "d3";

const RAW=[["Tongeren",50.7883,5.5349,"log","Belgium","BE","EU"],["Diegem",50.8856,4.4433,"admin","Belgium","BE","EU"],["Villar Perosa - Dante Alighieri",44.9214,7.2442,"mfg","Italy","IT","EU"],["Villar Perosa - Nazionale",44.9234,7.2438,"sales","Italy","IT","EU"],["Singapore",1.3336,103.7484,"sales","Singapore","SG","APAC"],["Blue Bell, PA",40.1419,-75.2868,"admin","United States","US","AM"],["Yoqneam",32.6715,35.1071,"admin","Israel","IL","MEA"],["Ostersund",63.1897,14.6513,"mfg","Sweden","SE","EU"],["Forrestfield WA",-31.9654,116.0008,"sales","Australia","AU","APAC"],["Ahmedabad",22.7834,72.328,"mfg","India","IN","APAC"],["Muehlheim",48.0263,8.8847,"other","Germany","DE","EU"],["Mysore",12.2096,76.6641,"mfg","India","IN","APAC"],["Seoul",37.5385,126.9453,"va","Korea","KR","APAC"],["Seoul Office",37.5385,126.9453,"other","Korea","KR","APAC"],["Dubai",25.2276,55.3222,"sales","UAE","AE","MEA"],["Dubai N320",25.2276,55.3222,"sales","UAE","AE","MEA"],["Montigny-le-Bretonneux",48.7888,2.044,"sales","France","FR","EU"],["Esvres-sur-Indre",47.2977,0.8063,"admin","France","FR","EU"],["Amadora",38.734,-9.224,"va","Portugal","PT","EU"],["Eagle Farm Qld",-27.4337,153.0891,"sales","Australia","AU","APAC"],["Luton",51.8649,-0.4102,"sales","United Kingdom","GB","EU"],["Luton - Dencora",51.9207,-0.4764,"sales","United Kingdom","GB","EU"],["Busan",35.1447,128.8704,"sales","Korea","KR","APAC"],["Shanghai - Anting",31.3326,121.1968,"other","China","CN","APAC"],["Shanghai - Yuanfu",31.3284,121.2,"other","China","CN","APAC"],["Shanghai - Xiechun",31.2943,121.1641,"sales","China","CN","APAC"],["Yokohama",35.5113,139.6179,"sales","Japan","JP","APAC"],["Skopje",41.9978,21.4039,"sales","North Macedonia","MK","EU"],["Heinsberg",51.0501,6.155,"mfg","Germany","DE","EU"],["Wuhu",30.9011,118.2887,"mfg","China","CN","APAC"],["Makati City",14.5363,121.0201,"sales","Philippines","PH","APAC"],["Plymouth, MI",42.3867,-83.5041,"sales","United States","US","AM"],["Bogota",4.6865,-74.0526,"sales","Colombia","CO","AM"],["Katrineholm",58.9956,16.2055,"mfg","Sweden","SE","EU"],["Cairo",30.0085,31.4285,"sales","Egypt","EG","MEA"],["Dalian",39.0647,121.7804,"mfg","China","CN","APAC"],["Rubi",41.4801,2.0258,"sales","Spain","ES","EU"],["Barendrecht",51.8582,4.5504,"sales","Netherlands","NL","EU"],["Saint Louis, MO",38.7294,-90.3199,"mfg","United States","US","AM"],["Lansdale, PA",40.2415,-75.2838,"sales","United States","US","AM"],["Aberdeen",57.1955,-2.1806,"sales","United Kingdom","GB","EU"],["Gothenburg - Utfalls",57.7271,12.027,"sales","Sweden","SE","EU"],["Villanova D'Asti",44.9408,7.9213,"mfg","Italy","IT","EU"],["Livingston",55.8807,-3.5342,"sales","United Kingdom","GB","EU"],["Steyr",48.0462,14.4502,"mfg","Austria","AT","EU"],["Muskegon, MI",43.2004,-86.2922,"mfg","United States","US","AM"],["Gothenburg HQ",57.75,11.93,"admin","Sweden","SE","EU"],["Guadalupe NL",25.6707,-100.1526,"mfg","Mexico","MX","AM"],["Schweinfurt",50.039,10.2249,"mfg","Germany","DE","EU"],["Chennai",13.0128,80.2075,"va","India","IN","APAC"],["Nanjing",32.0393,118.7845,"other","China","CN","APAC"],["Tianjin",39.1395,117.1907,"other","China","CN","APAC"],["Taiyuan",37.8735,112.5577,"sales","China","CN","APAC"],["Xian",34.3222,108.9458,"sales","China","CN","APAC"],["Chengdu",30.5723,104.0665,"sales","China","CN","APAC"],["Ningbo",29.8683,121.544,"sales","China","CN","APAC"],["Beijing",39.9677,116.4774,"sales","China","CN","APAC"],["Shenyang",41.7932,123.416,"sales","China","CN","APAC"],["Guangzhou",23.142,113.3226,"sales","China","CN","APAC"],["Leverkusen",51.0712,6.994,"mfg","Germany","DE","EU"],["Baku",40.3847,49.8287,"sales","Azerbaijan","AZ","MEA"],["Almaty",43.2295,76.9611,"sales","Kazakhstan","KZ","MEA"],["Qingdao",36.0635,120.383,"admin","China","CN","APAC"],["Haridwar",29.9229,78.031,"mfg","India","IN","APAC"],["Mumbai",18.9502,72.82,"admin","India","IN","APAC"],["Pune - Chakan",18.7632,73.8613,"mfg","India","IN","APAC"],["Bangalore",12.9716,77.5946,"mfg","India","IN","APAC"],["Beijing - Nankou",40.2467,116.135,"mfg","China","CN","APAC"],["Walldorf",49.2867,8.6484,"other","Germany","DE","EU"],["Johnson City, TN",36.3516,-82.318,"mfg","United States","US","AM"],["Gurgaon",28.4608,77.0781,"mfg","India","IN","APAC"],["Xinchang (SXC)",29.4515,121.0112,"mfg","China","CN","APAC"],["Berlin/Walldorf",52.4014,13.3848,"mfg","Germany","DE","EU"],["Steyr - Pachergasse",48.0412,14.4278,"sales","Austria","AT","EU"],["Yuyao (NGBC)",30.0371,121.1543,"mfg","China","CN","APAC"],["Suzhou",31.3876,120.9902,"mfg","China","CN","APAC"],["Jinan",36.6985,117.2706,"mfg","China","CN","APAC"],["Shanghai FTZ",31.3,121.6323,"sales","China","CN","APAC"],["Schwerzenbach",47.3882,8.6552,"sales","Switzerland","CH","EU"],["Scarborough, ON",43.7854,-79.2397,"log","Canada","CA","AM"],["Xinchang Admin",29.4515,121.0112,"admin","China","CN","APAC"],["Changzhou",31.8339,119.932,"sales","China","CN","APAC"],["Thetford",52.4252,0.7371,"sales","United Kingdom","GB","EU"],["West Bromwich",52.5168,-2.0199,"sales","United Kingdom","GB","EU"],["Landskrona",55.8703,12.8301,"mfg","Sweden","SE","EU"],["Gothenburg MFG",57.72,12.07,"mfg","Sweden","SE","EU"],["Wr. Neudorf",48.0732,16.3221,"sales","Austria","AT","EU"],["Airasca",44.9167,7.4676,"mfg","Italy","IT","EU"],["Shanghai - Yuanqi",31.3286,121.2024,"sales","China","CN","APAC"],["Budaors",47.4536,18.9599,"va","Hungary","HU","EU"],["Saint-Cyr-sur-Loire",47.4165,0.6635,"mfg","France","FR","EU"],["Hanover, PA",39.8219,-76.9592,"other","United States","US","AM"],["Lons-Le-Saunier",46.678,5.5809,"mfg","France","FR","EU"],["Stockholm",59.3044,18.0869,"mfg","Sweden","SE","EU"],["Dexter, MI",42.3398,-83.8735,"mfg","United States","US","AM"],["Elgin, IL",42.0559,-88.2985,"mfg","United States","US","AM"],["Oakleigh",-37.894,145.1003,"sales","Australia","AU","APAC"],["Puebla",19.0867,-98.2026,"sales","Mexico","MX","AM"],["Slough",51.5207,-0.6186,"sales","United Kingdom","GB","EU"],["Montevideo",-34.8973,-56.1811,"sales","Uruguay","UY","AM"],["Solwezi",-12.0992,26.4312,"sales","Zambia","ZM","AF"],["Milperra",-33.9291,150.985,"other","Australia","AU","APAC"],["East Tamaki",-36.939,174.8897,"other","New Zealand","NZ","APAC"],["Jakarta",-6.7192,107.0172,"other","Indonesia","ID","APAC"],["Poznan",52.4168,16.9813,"mfg","Poland","PL","EU"],["Warszawa",52.1561,21.0193,"va","Poland","PL","EU"],["Boksburg",-26.1637,28.2259,"sales","South Africa","ZA","AF"],["Shanghai - Jiading",31.426,121.1916,"sales","China","CN","APAC"],["Taicang",31.4987,121.1112,"sales","China","CN","APAC"],["Buenos Aires Admin",-34.453,-58.7276,"admin","Argentina","AR","AM"],["Buenos Aires Sales",-34.4547,-58.7218,"sales","Argentina","AR","AM"],["Quzhou",28.9019,118.511,"mfg","China","CN","APAC"],["Landvetter",57.6823,12.16,"mfg","Sweden","SE","EU"],["Hamburg",53.536,9.9672,"mfg","Germany","DE","EU"],["Lulea",65.5967,22.1424,"sales","Sweden","SE","EU"],["Linkoping",58.4234,15.6167,"mfg","Sweden","SE","EU"],["Busan - Centum",35.1769,129.1254,"sales","Korea","KR","APAC"],["Ornskoldsvik",63.2854,18.7213,"sales","Sweden","SE","EU"],["Falconer, NY",42.1187,-79.1984,"mfg","United States","US","AM"],["Hroznetin",50.3089,12.8641,"mfg","Czech Republic","CZ","EU"],["Winsted, CT",41.9555,-73.0498,"mfg","United States","US","AM"],["West Nyack, NY",41.0925,-73.9623,"sales","United States","US","AM"],["Lutsk",50.7519,25.3299,"mfg","Ukraine","UA","EU"],["Istanbul",40.9445,29.1405,"sales","Turkiye","TR","EU"],["Gazzada Schianno",45.7864,8.8394,"mfg","Italy","IT","EU"],["Nilai",2.8228,101.8222,"mfg","Malaysia","MY","APAC"],["Vilnius",54.6858,25.2601,"sales","Lithuania","LT","EU"],["Espoo",60.2139,24.8096,"sales","Finland","FI","EU"],["Landskrona - Bjorn",55.8879,12.8527,"sales","Sweden","SE","EU"],["Dalian - Tieshan",39.1054,121.9182,"sales","China","CN","APAC"],["Kings Lynn",52.7406,0.3906,"mfg","United Kingdom","GB","EU"],["Jakarta - Talavera",-6.2913,106.8036,"other","Indonesia","ID","APAC"],["Tanger",35.6575,-5.6618,"mfg","Morocco","MA","MEA"],["Milano",45.4458,9.1162,"sales","Italy","IT","EU"],["Limmared",57.5334,13.3553,"sales","Sweden","SE","EU"],["Cajamar",-23.3567,-46.8497,"va","Brazil","BR","AM"],["Sofia",42.6702,23.3509,"sales","Bulgaria","BG","EU"],["Cajamar - Anhang",-21.814,-47.4979,"other","Brazil","BR","AM"],["Osaka",34.7336,135.4959,"sales","Japan","JP","APAC"],["Waukegan, IL",42.3216,-87.8973,"mfg","United States","US","AM"],["Soham",52.3261,0.3508,"other","United Kingdom","GB","EU"],["Linkoping - Gillberg",58.4303,15.6063,"other","Sweden","SE","EU"],["Kiruna",67.8531,20.2644,"sales","Sweden","SE","EU"],["Riga",56.9089,24.0822,"sales","Latvia","LV","EU"],["Salt Lake City",40.7169,-112.0538,"mfg","United States","US","AM"],["Santiago",-33.4295,-70.7999,"sales","Chile","CL","AM"],["Cambiago",45.5803,9.4423,"sales","Italy","IT","EU"],["Oldham",53.525,-2.109,"other","United Kingdom","GB","EU"],["Dammam",26.4207,50.0888,"sales","Saudi Arabia","SA","MEA"],["Changsha",28.1946,112.9942,"sales","China","CN","APAC"],["Baotou",40.6571,109.8343,"sales","China","CN","APAC"],["Sarnia, ON",42.9412,-82.3498,"other","Canada","CA","AM"],["Montreal, QC",45.4563,-73.7263,"log","Canada","CA","AM"],["Calgary, AB",51.1187,-114.0434,"mfg","Canada","CA","AM"],["Alcobendas",40.534,-3.6328,"sales","Spain","ES","EU"],["Bangkok",13.6893,100.5483,"sales","Thailand","TH","APAC"],["Athens",37.9603,23.7209,"va","Greece","GR","EU"],["Clevedon",51.4294,-2.8627,"mfg","United Kingdom","GB","EU"],["Prague",50.1033,14.4448,"sales","Czech Republic","CZ","EU"],["Izmir",38.4508,27.1878,"sales","Turkiye","TR","EU"],["Pianezza",45.1212,7.6004,"other","Italy","IT","EU"],["Verona",45.3923,10.9857,"sales","Italy","IT","EU"],["Massa",44.0359,10.1054,"mfg","Italy","IT","EU"],["Modugno (Bari)",41.1108,16.7942,"mfg","Italy","IT","EU"],["Cassino",41.4894,13.8310,"mfg","Italy","IT","EU"],["Bologna",44.5213,11.2669,"sales","Italy","IT","EU"],["Cormano",45.5383,9.1655,"mfg","Italy","IT","EU"],["Hofors",60.5459,16.2841,"mfg","Sweden","SE","EU"],["Jonkoping",57.7742,14.1738,"sales","Sweden","SE","EU"],["Houston, TX",29.9366,-95.4808,"service","United States","US","AM"],["Moody, AL",33.5747,-86.4799,"service","United States","US","AM"],["Highland Heights",41.5462,-81.4552,"service","United States","US","AM"],["Flowery Branch",34.2004,-83.915,"mfg","United States","US","AM"],["Ladson, SC",32.9659,-80.1138,"mfg","United States","US","AM"],["Rosario",-32.9044,-60.894,"mfg","Argentina","AR","AM"],["St Michael",47.3531,15.0081,"sales","Austria","AT","EU"],["Frossasco",44.9273,7.3688,"mfg","Italy","IT","EU"],["Ljungaverk",62.4903,16.0566,"mfg","Sweden","SE","EU"],["Belleville, ON",44.1745,-77.3697,"other","Canada","CA","AM"],["Chodov",50.2321,12.7401,"mfg","Czech Republic","CZ","EU"],["Luechow",52.9768,11.1603,"other","Germany","DE","EU"],["Mannheim",49.4533,8.5182,"va","Germany","DE","EU"],["Crossville, TN",36.0083,-85.0558,"mfg","United States","US","AM"],["Kolkata",22.578,88.4382,"sales","India","IN","APAC"],["Derio",43.2901,-2.8852,"sales","Spain","ES","EU"],["Porrino",42.1201,-8.6213,"sales","Spain","ES","EU"],["Spanga",59.3797,17.9025,"other","Sweden","SE","EU"],["Huskvarna",57.7914,14.2632,"other","Sweden","SE","EU"],["Oslo",59.9542,10.765,"sales","Norway","NO","EU"],["Muurame",62.1035,25.6509,"mfg","Finland","FI","EU"],["Banbury",52.069,-1.336,"other","United Kingdom","GB","EU"],["Stonehouse",51.748,-2.2984,"admin","United Kingdom","GB","EU"],["Tunis",36.8321,10.2317,"sales","Tunisia","TN","MEA"],["Casablanca",33.5878,-7.6393,"sales","Morocco","MA","MEA"],["Algiers",36.7598,3.0137,"sales","Algeria","DZ","MEA"],["Accra",5.603,-0.1772,"sales","Ghana","GH","AF"],["Avallon",47.5965,4.183,"admin","France","FR","EU"],["Les Trois Moutiers",47.0644,0.0149,"mfg","France","FR","EU"],["Chateauneuf",44.9975,4.9829,"mfg","France","FR","EU"],["Tudela",42.0589,-1.6403,"other","Spain","ES","EU"],["Oudsbergen",51.0391,5.5368,"other","Belgium","BE","EU"],["Ostrava",49.8381,18.1547,"sales","Czech Republic","CZ","EU"],["Frauenfeld",47.5624,8.8709,"sales","Switzerland","CH","EU"],["Fribourg",46.7961,7.1452,"sales","Switzerland","CH","EU"],["Sofia MFG",42.6952,23.3289,"mfg","Bulgaria","BG","EU"],["Sopot",42.6537,24.7548,"mfg","Bulgaria","BG","EU"],["Karnare",42.7148,24.6447,"mfg","Bulgaria","BG","EU"],["Kalofer",42.613,24.9675,"mfg","Bulgaria","BG","EU"],["Zapopan",20.6666,-103.4011,"mfg","Mexico","MX","AM"],["Apodaca",25.7862,-100.1365,"sales","Mexico","MX","AM"],["San Isidro, Lima",-12.0963,-77.028,"sales","Peru","PE","AM"],["Arequipa",-16.3483,-71.5914,"sales","Peru","PE","AM"],["Bucharest",44.4432,26.0432,"sales","Romania","RO","EU"],["Caesarea",32.5155,34.9063,"sales","Israel","IL","MEA"],["New Taipei",25.0615,121.4867,"sales","Taiwan","TW","APAC"],["Taichung",24.2225,120.6545,"sales","Taiwan","TW","APAC"],["New Taipei HQ",25.0448,121.4683,"sales","Taiwan","TW","APAC"],["Kaohsiung",22.6333,120.3891,"sales","Taiwan","TW","APAC"],["Chino, Nagano",35.9893,138.1891,"mfg","Japan","JP","APAC"],["Busan MFG",35.1513,128.8158,"mfg","Korea","KR","APAC"],["Makati Office",14.5471,121.0155,"sales","Philippines","PH","APAC"],["Jakarta VA",-6.1716,106.9284,"va","Indonesia","ID","APAC"],["Daegu",35.7359,128.4566,"mfg","Korea","KR","APAC"],["Ho Chi Minh",10.728,106.7204,"sales","Viet Nam","VN","APAC"],["Hanoi",21.0125,105.8136,"sales","Viet Nam","VN","APAC"],["Zhengzhou",34.7469,113.6227,"sales","China","CN","APAC"],["Wuhan",30.5953,114.2703,"sales","China","CN","APAC"],["Tallinn",59.3996,24.8253,"sales","Estonia","EE","EU"],["Bratislava",48.1456,17.1429,"sales","Slovakia","SK","EU"],["Sarajevo",43.8577,18.4062,"sales","Bosnia","BA","EU"],["Zagreb",45.8148,15.8361,"sales","Croatia","HR","EU"],["Belgrade",44.8108,20.4366,"sales","Serbia","RS","EU"],["Ljubljana",46.0213,14.5393,"sales","Slovenia","SI","EU"],["Paget Qld",-21.1701,149.1683,"sales","Australia","AU","APAC"],["Valenciennes",50.3571,3.5183,"mfg","France","FR","EU"],["Kitwe",-12.8232,28.2176,"sales","Zambia","ZM","AF"],["Nairobi",-1.2976,36.8386,"sales","Kenya","KE","AF"],["Saint Marcel",49.0993,1.4555,"mfg","France","FR","EU"],["Judenburg",47.1811,14.6684,"mfg","Austria","AT","EU"],["Bietigheim",48.9399,9.1325,"mfg","Germany","DE","EU"],["UK Mouldings",52.77,0.40,"mfg","United Kingdom","GB","EU"],["Vernon",49.0928,1.4831,"mfg","France","FR","EU"],["Enschede",52.2215,6.8937,"mfg","Netherlands","NL","EU"],["Sumter, SC",33.9204,-80.3415,"mfg","United States","US","AM"],["La Silla (Monterrey)",25.6221,-100.2543,"mfg","Mexico","MX","AM"]];
const SITES=RAW.map(([name,lat,lng,type,country,iso,region])=>({name,lat,lng,type,country,iso,region}));

// Business unit classification for manufacturing sites
const BU_MAP={
  // Industrial
  'Steyr':'ind','Karnare':'ind','Sopot':'ind','Dalian':'ind','Beijing - Nankou':'ind',
  'Xinchang (SXC)':'ind','Yuyao (NGBC)':'ind','Les Trois Moutiers':'ind',
  'Saint-Cyr-sur-Loire':'ind','Schweinfurt':'ind','Hamburg':'ind','Hofors':'ind',
  'Katrineholm':'ind','Ljungaverk':'ind','Gothenburg MFG':'ind','Poznan':'ind',
  'Kings Lynn':'ind','Flowery Branch':'ind','Sumter, SC':'ind','Ahmedabad':'ind',
  'Pune - Chakan':'ind','Nilai':'ind','La Silla (Monterrey)':'ind',
  'Villar Perosa - Dante Alighieri':'ind','Airasca':'ind','Massa':'ind',
  'Modugno (Bari)':'ind','Cassino':'ind','Guadalupe NL':'ind',
  // SIS - Seals
  'Judenburg':'sis-seal','Kalofer':'sis-seal','Leverkusen':'sis-seal','Bietigheim':'sis-seal',
  'Landskrona':'sis-seal','Villanova D\'Asti':'sis-seal','Gazzada Schianno':'sis-seal',
  'Wuhu':'sis-seal','Elgin, IL':'sis-seal','Daegu':'sis-seal','Mysore':'sis-seal',
  'Zapopan':'sis-seal','Frossasco':'sis-seal','UK Mouldings':'sis-seal',
  // SIS - Lubrication
  'Berlin/Walldorf':'sis-lube','Cormano':'sis-lube','Chodov':'sis-lube','Muurame':'sis-lube',
  'Landvetter':'sis-lube','Linkoping':'sis-lube','Johnson City, TN':'sis-lube',
  'Saint Louis, MO':'sis-lube','Bangalore':'sis-lube','Suzhou':'sis-lube',
  'Enschede':'sis-lube','Rosario':'sis-lube',
  // SIS - Aerospace  
  'Lons-Le-Saunier':'sis-aero','Valenciennes':'sis-aero','Chateauneuf':'sis-aero',
  'Villar Perosa - Nazionale':'sis-aero','Clevedon':'sis-aero',
  'Falconer, NY':'sis-aero','Winsted, CT':'sis-aero','Dexter, MI':'sis-aero',
  'Ladson, SC':'sis-aero','Muskegon, MI':'sis-aero',
  // SIS - Magnetics
  'Calgary, AB':'sis-mag','Vernon':'sis-mag','Tanger':'sis-mag',
};
const BU_CFG={
  'ind':{label:'Industrial',color:'#3b82f6'},
  'sis-seal':{label:'SIS Seals',color:'#a78bfa'},
  'sis-lube':{label:'SIS Lubrication',color:'#06b6d4'},
  'sis-aero':{label:'SIS Aerospace',color:'#f97316'},
  'sis-mag':{label:'SIS Magnetics',color:'#f43f5e'},
};
SITES.forEach(s=>{if(BU_MAP[s.name])s.bu=BU_MAP[s.name]});

// SC Hub team roster
const TEAM=[
  {id:'jh',name:'Jonas Henriksson',role:'Head of Strategic Planning',initials:'JH',color:'#3b82f6'},
  {id:'ub',name:'Ulf Bergqvist',role:'S&OP Lead',initials:'UB',color:'#8b5cf6'},
  {id:'hn',name:'Harald Nilsson',role:'S&OE Lead',initials:'HN',color:'#06b6d4'},
  {id:'sk',name:'Steffen Krause',role:'Senior SC Leadership',initials:'SK',color:'#f97316'},
  {id:'gp',name:'Ganesh Patel',role:'Senior SC Leadership',initials:'GP',color:'#22c55e'},
  {id:'tm',name:'Tim Moermans',role:'MSP Exception Narratives',initials:'TM',color:'#eab308'},
  {id:'rd',name:'Rodrigo',role:'MSP Exception Narratives',initials:'RD',color:'#ef4444'},
  {id:'sj',name:'Sourabh Joshi',role:'Landed Cost Model AI',initials:'SJ',color:'#a78bfa'},
  {id:'ss',name:'Subhadarshi Sengupta',role:'IT Infrastructure',initials:'SS',color:'#14b8a6'},
];
const TEAM_MAP=Object.fromEntries(TEAM.map(t=>[t.id,t]));
const STATUS_CFG={
  open:{label:'Open',color:'#64748b',icon:'\u25CB'},
  assigned:{label:'Assigned',color:'#3b82f6',icon:'\ud83d\udc64'},
  in_progress:{label:'In Progress',color:'#eab308',icon:'\u23F3'},
  blocked:{label:'Blocked',color:'#ef4444',icon:'\u26D4'},
  done:{label:'Done',color:'#22c55e',icon:'\u2713'},
};

const TYPE_CFG={mfg:{label:'Manufacturing',color:'#3b82f6',shape:'tri',pri:1},log:{label:'Logistics',color:'#f59e0b',shape:'dia',pri:3},admin:{label:'Admin/HQ',color:'#6366f1',shape:'sq',pri:4},va:{label:'Vehicle AM',color:'#0ea5e9',shape:'dot',pri:5},service:{label:'Service',color:'#14b8a6',shape:'dot',pri:5},sales:{label:'Sales',color:'#64748b',shape:'dot',pri:6},other:{label:'Other',color:'#475569',shape:'dot',pri:7}};
const REGION_CFG={EU:{label:'Europe',color:'#60a5fa'},APAC:{label:'Asia Pacific',color:'#f43f5e'},AM:{label:'Americas',color:'#34d399'},MEA:{label:'Middle East & Africa',color:'#f97316'},AF:{label:'Africa',color:'#fbbf24'}};
const RMC={'Europe':'#60a5fa','Middle East':'#f97316','China':'#f43f5e','India':'#a78bfa','Americas':'#34d399','Africa':'#fbbf24','Global':'#94a3b8'};
const CPS=[{n:"Suez Canal",la:30.46,ln:32.34},{n:"Str. of Malacca",la:2.5,ln:101.2},{n:"Rotterdam",la:51.92,ln:4.48},{n:"Taiwan Strait",la:24.5,ln:119.5},{n:"Str. of Hormuz",la:26.57,ln:56.25},{n:"Panama Canal",la:9.08,ln:-79.68},{n:"Cape of Good Hope",la:-34.36,ln:18.49}];
const PORTS=[
  {n:"Hamburg",la:53.54,ln:9.97},{n:"Gothenburg",la:57.73,ln:11.94},{n:"Antwerp",la:51.26,ln:4.40},
  {n:"Genoa",la:44.41,ln:8.93},{n:"Savannah",la:32.08,ln:-81.09},{n:"Shanghai",la:31.23,ln:121.47},
  {n:"Ningbo",la:29.87,ln:121.54},{n:"Tanjung Pelepas",la:1.36,ln:103.55},
  {n:"Jebel Ali",la:24.98,ln:55.03},{n:"Nhava Sheva",la:18.95,ln:72.95},
  {n:"Itapoa",la:-26.12,ln:-48.62},
];
const AIRPORTS=[
  {n:"Frankfurt (FRA)",la:50.03,ln:8.57},{n:"Atlanta (ATL)",la:33.64,ln:-84.43},
  {n:"Mumbai (BOM)",la:19.09,ln:72.87},{n:"Gothenburg (GOT)",la:57.73,ln:11.94},
  {n:"Milan (MXP)",la:45.63,ln:8.72},{n:"Brussels (BRU)",la:50.90,ln:4.48},
  {n:"Shanghai (PVG)",la:31.23,ln:121.47},{n:"Dalian (DLC)",la:38.97,ln:121.60},
];
const ADDR={"Aberdeen":"Aberdeen|Stoneywood Park, Dyce, Aberdeen, AB21 7DZ","Ahmedabad":"Ahmedabad|Robinson Global Logistics Solutions Pvt Ltd, Indospace Park WH No. - 2","Airasca":"Airasca|Via Pinerolo 42-44, Airasca, 10060, ITA","Amadora":"Amadora|Estrada de Alfragide, 67","Apodaca":"Apodaca/Monterrey|No. 211 de la calle Centuria","Arequipa":"Arequipa|Av. Italia N°105, Rio Seco , Arequipa , Cerro Colorado, 4017, per","Athens":"Athens|128 Syngrou Avenue","Banbury":"Banbury|Unit 2 Canada Close, Marley Way","Bangkok":"Bangkok|127/44 Rama III Road","Barendrecht":"Barendrecht|Zuideinde 52","Beijing":"Beijing|Shangdong Park Lane Office Building, No. 2 East Fourth Ring North Road","Beijing - Nankou":"Beijing|Shangdong Park Lane Office Building, No. 2 East Fourth Ring North Road","Belleville, ON":"Belleville LS|349 Macdonald Ave Belleville, ON K8N 5B8","Berlin/Walldorf":"Berlin/Walldorf|Heinrich-Hertz-Strasse 13A","Bietigheim":"Bietigheim|Robert-Bosch-Strasse 11","Blue Bell, PA":"Blue Bell|801 Lakeview Dr, Blue Bell, PA 19422","Bogota":"Bogota|Avenida Calle 100 # 19 - 54, Oficina 501","Boksburg":"Boksburg|6 Marlin Road","Bologna":"Bologna|Via Martin Luther King 38/2","Bratislava":"Bratislava|No. 5944, Plynarenska 7/B","Bucharest":"Bucharest|No. 319G Splaiul Independentei","Buenos Aires Admin":"Buenos Aires|Ruta Panamericana Km 36","Buenos Aires Sales":"Buenos Aires|Ruta Panamericana Km 36","Busan":"Busan|Centum IS tower,  60, Centum buk-daero, Haeundae-gu","Busan - Centum":"Busan|Centum IS tower,  60, Centum buk-daero, Haeundae-gu","Busan MFG":"Busan|Centum IS tower,  60, Centum buk-daero, Haeundae-gu","Caesarea":"Caesarea|Leshem Street 9,11","Calgary, AB":"Calgary|Calgary – 72nd Avenue NE","Cassino":"Cassino|Via Casilina Sud km.140, Cassino, 03043, ITA","Chengdu":"Chengdu|R&F Zhi Di Plaza Office Tower, No. 1 Renmin South Second Road, Jinjian","Chodov":"Chodov|Vintířovská 1169, 357 35 Chodov","Clevedon":"Clevedon|08 Strode Rd, Clevedon","Cormano":"Cormano|Via Gramsci no. 55","Crossville, TN":"Crossville|714 Interchange Drive Crossivelle, TN 38571","Daegu":"Daegu|492, Nongong-ro","Dalian":"Dalian|No. 23, Shengxing Road, Desheng Street, Jinzhou District, Dalian, Liao","Dalian - Tieshan":"Dalian|No. 23, Shengxing Road, Desheng Street, Jinzhou District, Dalian, Liao","Derio":"Derio|No. 6-A, Calle Astintze","Dexter, MI":"Dexter|7222 Huron River Dr, Dexter, MI 48130","Diegem":"Diegem|Berkenlaan 8C","East Tamaki":"East Tamaki|Crooks Road 44C, East Tamaki, 2013","Elgin, IL":"Elgin|900 North State Street","Espoo":"Espoo|Säterinkatu 6, 02600 Espoo","Falconer, NY":"Falconer|1 Maroco Rd, Falconer, NY 14733","Flowery Branch":"Flowery Branch|5385 McEver Road, Flowery Branch, GA","Forrestfield WA":"Forrestfield|80 Nardine Close","Frauenfeld":"Frauenfeld|Hungerbuelstr.17","Gothenburg - Utfalls":"Gothenburg|Hornsgatan 1, Von Utfallsgatan 2-4, SvenWingqvist gata 1, Kullagergata","Gothenburg HQ":"Gothenburg|Hornsgatan 1, Von Utfallsgatan 2-4, SvenWingqvist gata 1, Kullagergata","Gothenburg MFG":"Gothenburg|Hornsgatan 1, Von Utfallsgatan 2-4, SvenWingqvist gata 1, Kullagergata","Guadalupe NL":"Guadalajara|Gobernador Curiel 2690 , Guadalajara , Jalisco, 44940, mex","Guangzhou":"Guangzhou|Dahaodu Plaza, No. 183 Tianhe North Road, Tianhe District","Hamburg":"Hamburg|Hermann-Blohm-Str. 5","Hanoi":"Hanoi|No. 37 Le Van Luong","Ho Chi Minh":"Ho Chi Minh City|Crescent Plaza, 105 Ton Dat Tien Street, Tan Phu Ward,District 7,Ho Ch","Hofors":"Hofors|Riksväg 80","Istanbul":"Istanbul|Block A, Kugukyali Office Park Project","Izmir":"Izmir|Ankara Cad. No: 81","Jakarta":"Jakarta|Talavera Office Park, Talavera Tower 9th floor Jl. TB. Simatupang Kav.","Jakarta - Talavera":"Jakarta|Talavera Office Park, Talavera Tower 9th floor Jl. TB. Simatupang Kav.","Jakarta VA":"Jakarta|Talavera Office Park, Talavera Tower 9th floor Jl. TB. Simatupang Kav.","Johnson City, TN":"Johnson City|167 Roweland Drive, Johnson City, TN 37601","Judenburg":"Judenburg|Gabelhoferstraße 25, 8750 Judenburg","Kalofer":"Kalofer|Industrial Area, 4370","Kaohsiung":"Kaohsiung City|No.288, Fengping 1st Road, Daliao District","Karnare":"Karnare|4337 Karnare","Katrineholm":"Katrineholm|Fredsgatan 3","Kings Lynn":"Kings Lynn|Wisbech Road","Kiruna":"Kiruna|Latsvagen 11B, Skrapan 8","Kitwe":"Kitwe|Chingola Road","La Silla (Monterrey)":"La Silla|Guadalupe, Nuevo Leon, Av La Sierra 1303 Parque Industrial La Silla","Ladson, SC":"Ladson|8701 Palmetto Commerce Parkway Ladson SC 29456","Landskrona":"Landskrona|Björngatan 3, 261 44 Landskrona","Landskrona - Bjorn":"Landskrona|Björngatan 3, 261 44 Landskrona","Leverkusen":"Leverkusen|Düsseldorfer Str. 121","Limmared":"Limmared|Sodra vagen 2","Ljubljana":"Ljubljana|Ukmarjeva ulica 6, Stavbi st. 2653","Ljungaverk":"Ljungaverk|Industriområde 3","Luton":"Luton|Part Ground Floor (North) 400 Capability Green","Luton - Dencora":"Luton|Part Ground Floor (North) 400 Capability Green","Makati City":"Makati|2284 Don Chino Roces Avenue","Makati Office":"Makati|2284 Don Chino Roces Avenue","Massa":"Massa|Via San Colombano 3, Massa, 54100, ITA","Milperra":"Milperra NSW|Milperra Road 1/202-214, Milperra NSW, 2214","Montigny-le-Bretonneux":"Montigny le Bretonneux|23 Place Wicklow","Moody, AL":"Moody|2575 US Highway 78, Moody, AL 35004","Mumbai":"Mumbai|7 Netaji Subhash Road","Muskegon, MI":"Muskegon|2860 McCracken Street, Norton Shores, MI 49441","Muurame":"Muurame|Teollisuustie 6, 40950","Mysore":"Mysore|Plot Nos. 36-Part, 37, 37, & 39, Kadakola Industrial Area","Nanjing":"Nanjing|Xindi Center Phase I, 50th Floor, No. 188 Lushan Road, Jianye District","New Taipei":"New Taipei City|No.10, Ln. 609, Sec. 5, Chongxin Rd., Sanchong Dist.","New Taipei HQ":"New Taipei City|No.10, Ln. 609, Sec. 5, Chongxin Rd., Sanchong Dist.","Nilai":"Nilai|Lot 7910, Jalan Ts Utama, Taman Semarak, 71807 Nilai","Oakleigh":"Oakleigh VIC|17-21 Stamford Road, Oakleigh VIC, 3166","Oldham":"Oldham|Dowry Street","Osaka":"Osaka|PMO EX Shin-Osaka H¹O Shin-Osaka,4-2-10 Miyahara, Yodogawa-ku,Osaka","Oslo":"Oslo|Gjerdrums vei 8, gnr 74, bnr 23","Ostersund":"Ostersund|Arenavagen 4, Ostersund, 831 58","Oudsbergen":"Oudsbergen|Nijverheidslaan 1500","Poznan":"Poznan|Wrzesińska, 61-022 Poznań","Prague":"Prague|Delnicka 1628","Pune - Chakan":"Pune|Chinchwad, Pune, Maharashtra, 411 033, IND","Qingdao":"Qingdao|HNA Wanbang Center, No. 234 Yan’an Third Road, Shinan District","Rosario":"Rosario|Km 1, 3 of Ruta Nacional AO12","Saint-Cyr-sur-Loire":"Saint-Cyr-sur-Loire|204 Boulevard Charles de Gaulle, Saint-Cyr-Sur-Loire, 37 - Indre-et-Lo","Santiago":"Santiago|Av Miraflores 9300, lote 18, comuna de Pudahuel","Sarajevo":"Sarajevo|Fra Andela Zvizdovica 1","Sarnia, ON":"Sarnia|960 Atkin Avenue Sarnia, ON N7W 1A7","Scarborough, ON":"Scarborough|40 Executive Court Scaroborough, ON M1S 4N4","Schweinfurt":"Schweinfurt|Ernst Sachs Strasse","Schwerzenbach":"Schwerzenbach|Eschenstrasse 5","Seoul":"Seoul|Dabo B/D,  20, Mapo-daero, Mapo-gu","Seoul Office":"Seoul|Dabo B/D,  20, Mapo-daero, Mapo-gu","Shanghai - Anting":"Shanghai|NO.1200 Xingrong Road, Jiading Industrial Zone, Shanghai, Shanghai, 21","Shanghai - Jiading":"Shanghai|NO.1200 Xingrong Road, Jiading Industrial Zone, Shanghai, Shanghai, 21","Shanghai - Xiechun":"Shanghai|NO.1200 Xingrong Road, Jiading Industrial Zone, Shanghai, Shanghai, 21","Shanghai - Yuanfu":"Shanghai|NO.1200 Xingrong Road, Jiading Industrial Zone, Shanghai, Shanghai, 21","Shanghai - Yuanqi":"Shanghai|NO.1200 Xingrong Road, Jiading Industrial Zone, Shanghai, Shanghai, 21","Shanghai FTZ":"Shanghai|NO.1200 Xingrong Road, Jiading Industrial Zone, Shanghai, Shanghai, 21","Shenyang":"Shenyang|China Resources Tower, No. 286 Youth Avenue, Heping District, Shenyang","Singapore":"Singapore|No. 20 Toh Guan Road","Sofia":"Sofia|36 Dragan Tsankov Blvd.","Sofia MFG":"Sofia|36 Dragan Tsankov Blvd.","Sopot":"Sopot|4330 Sopot, Bulgaria","Steyr":"Steyr|Seitenstettner Str. 15/B122,","Steyr - Pachergasse":"Steyr|Seitenstettner Str. 15/B122,","Stockholm":"Stockholm|Hammarby Kaj 14, Båtturen 2","Sumter, SC":"Sumter|925 Corporate Circle, Sumter, SC 29154","Suzhou":"Suzhou|No. 188, Guangzhou East Road","Taichung":"Taichung City|No.14-1, Ln.272.Dalin Rd.,Daya Dist.","Tanger":"Tanger|Tangier - Lot no. 173, Export Free Zone of Tangier Automotive City","Thetford":"Thetford|Unit 10, Brunel Business Court, Brunel Way","Tianjin":"Tianjin|R&F Zhi Di International Center Office Tower, No. 129 Dongma Road, Nan","Tongeren":"Tongeren|Heersterveldweg 6","Valenciennes":"Valenciennes|Zone Industrielle No. 2, Valenciennes, 59 - Nord, 59309, FRA","Vernon":"Vernon|1 Avenue Hubert Curien","Verona":"Verona|Via Mezzacampagna No. 25/A","Villanova D'Asti":"Villanova|Strada per Poirino 41","Villar Perosa - Dante Alighieri":"Villar Perosa|Via Dante Alighieri 6, Villar Perosa, 10069, ITA","Villar Perosa - Nazionale":"Villar Perosa|Via Dante Alighieri 6, Villar Perosa, 10069, ITA","West Bromwich":"West Bromwich|Unit 11 Navigation Way","Winsted, CT":"Winsted|149 Colebrook Rd, Rt8, Winstead, CT","Wr. Neudorf":"Wr. Neudorf|Industriezentrum NO Sud 1 Obj 50, Wr. Neudorf, 2351","Wuhan":"Wuhan|Enterprise Tian Di No. 1, No. 1505 Zhongshan Avenue, Jiang’an District","Wuhu":"Wuhu|No. 208 Huashan Road","Xinchang (SXC)":"Xinchang|No. 2 AoFeng Road","Xinchang Admin":"Xinchang|No. 2 AoFeng Road","Yokohama":"Yokohama|Innotech Building,3-17-6 Shin-Yokohama, Kohoku-ku,Yokoham","Yuyao (NGBC)":"Yuyao|No. 88, Zhoutai Road, Yuyao Industrial, Yuyao City, Zhejiang Province","Zagreb":"Zagreb|Samoborska cesta 255","Zapopan":"Zapopan|Av. Guadalupe No. 920"};
const RTS=[
  // ── SEA LANES — detailed waypoints hugging coastlines ──
  // Common segments:
  // North Sea exit: [53.54,9.97]→[56.0,4.0]→[51.5,1.5] (Dover)
  // English Channel→Bay of Biscay: [49.5,-5.0] (off Cornwall)→[47.0,-6.5] (off Brittany)→[44.0,-9.0] (off Galicia)
  // Gibraltar: [36.2,-6.0]→[36.0,-5.3] (strait)→[36.5,-2.0]→[37.5,0.5] (into Med)
  // Suez: [31.3,32.3]→[29.9,32.6]→[14.0,42.5] (Red Sea)→[12.6,43.3] (Bab el-Mandeb)
  // Indian Ocean: [11.0,51.0]→[7.0,80.0]→[5.0,95.0]
  // Malacca: [1.3,103.8]→[5.0,112.0]→[10.0,112.0]

  {pts:[[53.54,9.97],[56.0,4.0],[51.5,1.5],[49.5,-5.0],[47.0,-6.5],[44.0,-9.5],[40.0,-9.8],[36.8,-8.5],[36.2,-6.0],[36.0,-5.3],[36.5,-2.0],[37.5,0.5],[36.0,14.0],[33.0,28.0],[31.3,32.3],[29.9,32.6],[14.0,42.5],[12.6,43.3],[11.0,51.0],[5.5,77.0],[3.0,80.0],[2.0,90.0],[5.8,94.0],[5.0,97.5],[3.5,100.5],[2.0,102.5],[1.3,103.8],[5.0,108.0],[10.0,112.0],[20.0,117.0],[28.0,122.0],[31.23,121.47]],label:'Hamburg\u2192Shanghai',corridor:'EU-CN',type:'sea',origin:'Schweinfurt'},

  {pts:[[53.54,9.97],[56.0,4.0],[51.5,1.5],[49.5,-5.0],[47.0,-6.5],[44.0,-9.5],[40.0,-9.8],[36.8,-8.5],[34.0,-12.0],[30.0,-20.0],[32.08,-81.09]],label:'Hamburg\u2192Savannah',corridor:'EU-US',type:'sea',origin:'Schweinfurt'},

  {pts:[[57.73,11.94],[56.0,4.0],[51.5,1.5],[49.5,-5.0],[47.0,-6.5],[44.0,-9.5],[40.0,-9.8],[36.8,-8.5],[34.0,-12.0],[30.0,-20.0],[32.08,-81.09]],label:'Gothenburg\u2192Savannah',corridor:'EU-US',type:'sea',origin:'Gothenburg'},

  {pts:[[29.87,121.54],[20.0,117.0],[10.0,112.0],[5.0,108.0],[1.3,103.8],[2.0,102.5],[3.5,100.5],[5.0,97.5],[5.8,94.0],[2.0,90.0],[3.0,80.0],[5.5,77.0],[11.0,51.0],[12.6,43.3],[14.0,42.5],[29.9,32.6],[31.3,32.3],[33.0,28.0],[36.0,14.0],[37.5,0.5],[36.5,-2.0],[36.0,-5.3],[36.2,-6.0],[36.8,-8.5],[40.0,-9.8],[34.0,-12.0],[30.0,-20.0],[32.08,-81.09]],label:'Ningbo\u2192Savannah',corridor:'CN-US',type:'sea',origin:'Xinchang'},

  {pts:[[57.73,11.94],[56.0,4.0],[51.5,1.5],[49.5,-5.0],[47.0,-6.5],[44.0,-9.5],[40.0,-9.8],[36.8,-8.5],[36.2,-6.0],[36.0,-5.3],[36.5,-2.0],[37.5,0.5],[36.0,14.0],[33.0,28.0],[31.3,32.3],[29.9,32.6],[14.0,42.5],[12.6,43.3],[11.0,51.0],[5.5,77.0],[3.0,80.0],[2.0,90.0],[5.8,94.0],[5.0,97.5],[3.5,100.5],[2.0,102.5],[1.3,103.8],[5.0,108.0],[10.0,112.0],[20.0,117.0],[28.0,122.0],[31.23,121.47]],label:'Gothenburg\u2192Shanghai',corridor:'EU-CN',type:'sea',origin:'Gothenburg'},

  {pts:[[44.41,8.93],[43.0,6.0],[40.0,3.0],[37.5,0.5],[36.5,-2.0],[36.0,-5.3],[36.2,-6.0],[36.8,-8.5],[40.0,-9.8],[34.0,-12.0],[30.0,-20.0],[32.08,-81.09]],label:'Genoa\u2192Savannah',corridor:'EU-US',type:'sea',origin:'Airasca'},

  {pts:[[44.41,8.93],[43.0,6.0],[40.0,3.0],[37.5,0.5],[36.0,14.0],[33.0,28.0],[31.3,32.3],[29.9,32.6],[14.0,42.5],[12.6,43.3],[11.0,51.0],[5.5,77.0],[3.0,80.0],[2.0,90.0],[5.8,94.0],[5.0,97.5],[3.5,100.5],[2.0,102.5],[1.3,103.8],[5.0,108.0],[10.0,112.0],[20.0,117.0],[28.0,122.0],[31.23,121.47]],label:'Genoa\u2192Shanghai',corridor:'EU-CN',type:'sea',origin:'Airasca'},

  {pts:[[31.23,121.47],[28.0,122.0],[20.0,117.0],[10.0,112.0],[5.0,108.0],[1.3,103.8],[1.36,103.55]],label:'Shanghai\u2192Tanjung Pelepas',corridor:'CN-ASEAN',type:'sea',origin:'Shanghai'},

  {pts:[[51.26,4.40],[51.5,1.5],[49.5,-5.0],[47.0,-6.5],[44.0,-9.5],[40.0,-9.8],[36.8,-8.5],[36.2,-6.0],[34.0,-12.0],[28.0,-17.0],[15.0,-25.0],[0.0,-20.0],[-15.0,-30.0],[-26.12,-48.62]],label:'Antwerp\u2192Itapoa\u0301',corridor:'EU-BR',type:'sea',origin:'Tongeren'},

  {pts:[[57.73,11.94],[56.0,4.0],[51.5,1.5],[49.5,-5.0],[47.0,-6.5],[44.0,-9.5],[40.0,-9.8],[36.8,-8.5],[36.2,-6.0],[36.0,-5.3],[36.5,-2.0],[37.5,0.5],[36.0,14.0],[33.0,28.0],[31.3,32.3],[29.9,32.6],[14.0,42.5],[12.6,43.3],[11.0,51.0],[5.5,77.0],[3.0,80.0],[2.0,90.0],[5.8,94.0],[5.0,97.5],[3.5,100.5],[2.0,102.5],[1.3,103.8],[1.36,103.55]],label:'Gothenburg\u2192Tanjung Pelepas',corridor:'EU-ASEAN',type:'sea',origin:'Gothenburg'},

  {pts:[[51.26,4.40],[51.5,1.5],[49.5,-5.0],[47.0,-6.5],[44.0,-9.5],[40.0,-9.8],[36.8,-8.5],[36.2,-6.0],[36.0,-5.3],[36.5,-2.0],[37.5,0.5],[36.0,14.0],[33.0,28.0],[31.3,32.3],[29.9,32.6],[14.0,42.5],[12.6,43.3],[12.5,45.0],[13.5,48.5],[15.0,52.0],[22.0,60.0],[25.3,57.0],[26.2,56.4],[24.98,55.03]],label:'Antwerp\u2192Jebel Ali',corridor:'EU-ME',type:'sea',origin:'Tongeren'},

  {pts:[[57.73,11.94],[56.0,4.0],[51.5,1.5],[49.5,-5.0],[47.0,-6.5],[44.0,-9.5],[40.0,-9.8],[36.8,-8.5],[36.2,-6.0],[36.0,-5.3],[36.5,-2.0],[37.5,0.5],[36.0,14.0],[33.0,28.0],[31.3,32.3],[29.9,32.6],[14.0,42.5],[12.6,43.3],[11.5,47.0],[12.0,52.0],[15.0,62.0],[18.95,72.95]],label:'Gothenburg\u2192Nhava Sheva',corridor:'EU-IN',type:'sea',origin:'Gothenburg'},

  {pts:[[51.26,4.40],[51.5,1.5],[49.5,-5.0],[47.0,-6.5],[44.0,-9.5],[40.0,-9.8],[36.8,-8.5],[34.0,-12.0],[30.0,-20.0],[32.08,-81.09]],label:'Antwerp\u2192Savannah',corridor:'EU-US',type:'sea',origin:'Tongeren'},

  {pts:[[31.23,121.47],[28.0,122.0],[20.0,117.0],[10.0,112.0],[5.0,108.0],[1.3,103.8],[2.0,102.5],[3.5,100.5],[5.0,97.5],[5.8,94.0],[2.0,90.0],[3.0,80.0],[5.5,77.0],[11.0,51.0],[12.6,43.3],[14.0,42.5],[29.9,32.6],[31.3,32.3],[33.0,28.0],[36.0,14.0],[37.5,0.5],[36.5,-2.0],[36.0,-5.3],[36.2,-6.0],[36.8,-8.5],[40.0,-9.8],[44.0,-9.5],[47.0,-6.5],[49.5,-5.0],[51.5,1.5],[51.26,4.40]],label:'Shanghai\u2192Antwerp',corridor:'CN-EU',type:'sea',origin:'Shanghai'},

  // ── AIR LANES (great circles fine for air) ──
  {f:[50.03,8.57],t:[33.64,-84.43],label:'Frankfurt\u2192Atlanta',corridor:'EU-US',type:'air',origin:'Schweinfurt'},
  {f:[50.03,8.57],t:[19.09,72.87],label:'Frankfurt\u2192Mumbai',corridor:'EU-IN',type:'air',origin:'Schweinfurt'},
  {f:[57.73,11.94],t:[19.09,72.87],label:'Gothenburg\u2192Mumbai',corridor:'EU-IN',type:'air',origin:'Gothenburg'},
  {f:[45.63,8.72],t:[31.23,121.47],label:'Milan\u2192Shanghai',corridor:'EU-CN',type:'air',origin:'Airasca'},
  {f:[50.90,4.48],t:[31.23,121.47],label:'Brussels\u2192Shanghai',corridor:'EU-CN',type:'air',origin:'Tongeren'},
  {f:[31.23,121.47],t:[19.09,72.87],label:'Shanghai\u2192Mumbai',corridor:'CN-IN',type:'air',origin:'Xinchang'},
  {f:[38.97,121.60],t:[19.09,72.87],label:'Dalian\u2192Mumbai',corridor:'CN-IN',type:'air',origin:'Dalian'},
  {f:[50.03,8.57],t:[31.23,121.47],label:'Frankfurt\u2192Shanghai',corridor:'EU-CN',type:'air',origin:'Schweinfurt'},
  {f:[57.73,11.94],t:[31.23,121.47],label:'Gothenburg\u2192Shanghai',corridor:'EU-CN',type:'air',origin:'Gothenburg'},
  {f:[45.63,8.72],t:[19.09,72.87],label:'Milan\u2192Mumbai',corridor:'EU-IN',type:'air',origin:'Airasca'},
];

// ── Sample data — realistic results for prototype demo ──
// Live scanning enabled on AWS deployment with Bedrock + web search
const SAMPLE={
disruptions:[
  {event:"EU Steel Safeguard Quotas Tightening",description:"European Commission reduced 2026 steel import quotas by 3% across product categories. Hot-rolled coil prices up 8% in Q1. SKF's European bearing plants face rising input costs for ring and roller production.",category:"Trade Policy",severity:"High",trend:"Escalating",region:"Europe",lat:50.85,lng:4.35,skf_exposure:"Direct cost impact on Gothenburg, Landskrona, Bietigheim, Steyr ring production. Steel is SKF's #1 input cost.",recommended_action:"Accelerate dual-sourcing from Indian and Turkish steel mills. Review Q2 pricing pass-through with OEM customers."},
  {event:"Red Sea Shipping Disruptions Continue",description:"Houthi attacks on commercial shipping persist, forcing EU-Asia container traffic via Cape of Good Hope. Transit times increased 10-14 days, freight rates 2.5x above pre-crisis levels on Asia-Europe routes.",category:"Logistics/Port",severity:"Critical",trend:"Stable",region:"Middle East",lat:14.5,lng:42.5,skf_exposure:"Delays to components from China/India factories to European assembly. Nilai (Malaysia) to EU shipments +12 days. Bearing exports from Pune to EU customers affected.",recommended_action:"Pre-position 2 additional weeks safety stock at Tongeren logistics hub. Shift urgent shipments to air freight for critical OEM deliveries."},
  {event:"Ukraine-Russia War — Lutsk Plant Operating Under Constraints",description:"Ongoing conflict continues to affect SKF's Lutsk manufacturing facility in western Ukraine. Intermittent power outages and logistics challenges persist, though the plant remains operational.",category:"Geopolitical",severity:"High",trend:"Stable",region:"Europe",lat:50.75,lng:25.33,skf_exposure:"Lutsk bearing plant operating at ~70% capacity. Employee safety protocols active. Alternative supply from Chodov (Czech) and Karnare (Bulgaria) partially compensating.",recommended_action:"Maintain dual-sourcing from Czech/Bulgaria plants. Continue employee support programs. Monitor escalation risk to western Ukraine."},
  {event:"China Rare Earth Export Controls Expanded",description:"Beijing expanded export licensing requirements for rare earth permanent magnets and processing technology. New controls affect samarium-cobalt and neodymium materials used in high-performance bearings.",category:"Trade Policy",severity:"High",trend:"Escalating",region:"China",lat:39.9,lng:116.4,skf_exposure:"Sensor-bearing integrated units at Xinchang (SXC) and Yuyao (NGBC) plants use rare earth components. Supply for magnetic bearing lines at risk.",recommended_action:"Qualify alternative magnet suppliers in Japan and Vietnam. Build 6-month buffer stock of critical rare earth components."},
  {event:"India Monsoon Season — Pune/Chakan Logistics",description:"Heavier than normal pre-monsoon rainfall affecting road infrastructure in Maharashtra. Pune-Mumbai expressway intermittent closures impacting container movement to JNPT port.",category:"Natural Disaster",severity:"Medium",trend:"New",region:"India",lat:18.76,lng:73.86,skf_exposure:"Pune-Chakan factory export shipments delayed 2-4 days. Ahmedabad and Haridwar plants unaffected. Bangalore facility monitoring Karnataka rainfall levels.",recommended_action:"Pre-ship Q3 export orders before peak monsoon. Coordinate with freight forwarders for alternative road routes."},
  {event:"Port of Rotterdam Labour Negotiations",description:"Dockworkers' union FNV in negotiations for new collective agreement. Previous rounds included work slowdowns. Key gateway for SKF European distribution.",category:"Labour/Strike",severity:"Medium",trend:"Escalating",region:"Europe",lat:51.92,lng:4.48,skf_exposure:"Rotterdam is primary import/export hub for SKF's European supply chain. Work stoppages would delay inbound steel and outbound finished bearings across EU.",recommended_action:"Identify contingency routing through Antwerp and Hamburg. Pre-position critical inventory at Tongeren before negotiation deadline."},
  {event:"US Section 301 Tariffs on Chinese Bearings",description:"USTR maintaining 25% tariffs on Chinese-origin bearings entering the US. No indication of relief in current review cycle. Chinese competitors absorbing partial cost, creating pricing pressure.",category:"Trade Policy",severity:"Medium",trend:"Stable",region:"Americas",lat:38.9,lng:-77.0,skf_exposure:"Positive for SKF US manufacturing (Waukegan, Salt Lake City, Crossville) vs Chinese imports. But Dalian/Wuhu exports to US market face 25% duty.",recommended_action:"Maximize US-origin production for domestic market. Route China production to non-US markets."},
  {event:"Taiwan Strait Military Exercises",description:"PLA conducting increased naval exercises near Taiwan. Shipping insurance premiums for Taiwan Strait transit rose 15%. No direct trade disruption yet but contingency planning accelerating across industry.",category:"Geopolitical",severity:"Medium",trend:"Stable",region:"China",lat:24.5,lng:119.5,skf_exposure:"Taiwan offices (New Taipei, Taichung, Kaohsiung) manage semiconductor-bearing customer relationships. Strait closure would disrupt all East Asia maritime logistics.",recommended_action:"Map Taiwan-dependent component flows. Prepare air-freight contingency for critical sensor components sourced from Taiwan."},
  {event:"Argentina Peso Devaluation Impact",description:"Argentine peso continued depreciation affecting Rosario plant cost competitiveness. Dollar-denominated input costs rising while local revenue partially hedged.",category:"Currency",severity:"Low",trend:"Stable",region:"Americas",lat:-32.9,lng:-60.9,skf_exposure:"Rosario manufacturing plant margins under pressure. Buenos Aires admin costs rising in USD terms. Export competitiveness improving for Mercosur customers.",recommended_action:"Review hedging strategy for ARS exposure. Leverage improved export pricing to grow regional market share."},
  {event:"German Energy Cost Stabilization",description:"Industrial electricity prices in Germany stabilized at pre-2022 levels following new LNG terminal capacity. Positive for energy-intensive bearing manufacturing operations.",category:"Other",severity:"Low",trend:"De-escalating",region:"Europe",lat:50.04,lng:10.22,skf_exposure:"Schweinfurt, Leverkusen, Heinsberg, Bietigheim plants benefit from normalized energy costs. Competitive position vs Asian imports improving.",recommended_action:"Lock in favorable long-term energy contracts. Reinvest savings into automation at German facilities."}
],
geopolitical:[
  {risk:"Russia-Ukraine War",trend:"Stable",trend_arrow:"\u2192",this_week:"Continued frontline fighting in Donetsk. EU 15th sanctions package in preparation targeting metals trade. Grain corridor negotiations stalled.",skf_relevance:"Lutsk plant in western Ukraine operating at reduced capacity. Russian market fully exited. Sanctions compliance ongoing for indirect supply chains.",risk_level:"Critical",region:"Europe",lat:48.38,lng:31.17,watchpoint:"Escalation to western Ukraine. New EU sanctions on steel/metals. Energy infrastructure targeting before winter."},
  {risk:"US-China Strategic Competition",trend:"Escalating",trend_arrow:"\u2197",this_week:"New semiconductor export controls announced. PLA exercises near Taiwan increased. Diplomatic channels remain open but tense.",skf_relevance:"32 SKF sites in China. Dual-use technology scrutiny on sensor-integrated bearings. Customer relationship management across both blocs increasingly complex.",risk_level:"High",region:"China",lat:35.86,lng:104.2,watchpoint:"Taiwan contingency. Technology decoupling acceleration. Secondary sanctions risk on Chinese entities."},
  {risk:"Middle East Instability — Red Sea / Iran",trend:"Escalating",trend_arrow:"\u2197",this_week:"Houthi attacks continue despite US/UK strikes. Iran nuclear talks at impasse. Israel-Gaza situation unresolved.",skf_relevance:"Suez Canal and Strait of Hormuz both under elevated risk. EU-Asia shipping corridor disrupted. Dubai and Dammam sales offices monitoring regional stability.",risk_level:"High",region:"Middle East",lat:26.0,lng:44.0,watchpoint:"Strait of Hormuz closure risk. Expansion of Red Sea conflict. Oil price spikes affecting logistics costs."},
  {risk:"EU Political Fragmentation",trend:"Escalating",trend_arrow:"\u2197",this_week:"Rising nationalist parties challenging industrial policy consensus. Debates on trade defense instruments intensifying. Green Deal implementation timelines under pressure.",skf_relevance:"EU is SKF's largest market. Industrial policy changes affect steel safeguards, anti-dumping duties, and carbon border adjustments — all directly impacting bearing manufacturing costs.",risk_level:"Medium",region:"Europe",lat:50.85,lng:4.35,watchpoint:"EU elections aftermath. Trade defense instrument revisions. CBAM implementation timeline."},
  {risk:"India-China Border Tensions",trend:"Stable",trend_arrow:"\u2192",this_week:"Continued military deployments at LAC. Bilateral trade paradoxically growing. Some diplomatic thaw in business relations.",skf_relevance:"SKF has 5 factories in India and 7+ in China. Component flows between the two countries minimal but customer relationships span both. India positioning as China+1 alternative.",risk_level:"Medium",region:"India",lat:28.6,lng:77.2,watchpoint:"LAC escalation. India trade restrictions on Chinese imports. Supply chain China+1 acceleration."},
  {risk:"Global Industrial Recession Signals",trend:"De-escalating",trend_arrow:"\u2198",this_week:"European PMI showing tentative recovery. US manufacturing orders stabilizing. China stimulus measures showing some effect on industrial output.",skf_relevance:"Bearing demand is a direct proxy for industrial activity. Recovery in EU/US manufacturing benefits all SKF segments. China construction sector remains weak affecting infrastructure bearings.",risk_level:"Medium",region:"Global",lat:20.0,lng:0.0,watchpoint:"EU PMI trend confirmation. China property sector. US interest rate trajectory and capex investment cycle."},
  {risk:"Mexico Nearshoring Boom",trend:"Escalating",trend_arrow:"\u2197",this_week:"Record FDI into Mexican manufacturing. New automotive plants announced. Infrastructure constraints emerging in northern border states.",skf_relevance:"Guadalupe (Monterrey) plant well-positioned for nearshoring demand. Growing customer base in Mexican automotive sector. Logistics infrastructure in NL state under strain.",risk_level:"Low",region:"Americas",lat:25.67,lng:-100.15,watchpoint:"US-Mexico trade policy stability. Infrastructure investment in NL state. Competitive dynamics vs Asian suppliers."},
  {risk:"Africa Critical Minerals Competition",trend:"Escalating",trend_arrow:"\u2197",this_week:"EU and US competing with China for cobalt, lithium, and manganese access in DRC, Zambia, and South Africa. New bilateral mining agreements signed.",skf_relevance:"SKF mining equipment bearings used across African mining operations. Kitwe and Solwezi sales offices positioned for growth. Critical minerals supply security relevant for EV bearing production.",risk_level:"Low",region:"Africa",lat:-12.8,lng:28.2,watchpoint:"Mining regulation changes. Infrastructure development. China vs West competition for mineral access."}
],
trade:[
  {event:"EU Steel Safeguard Measures — 2026 Review",description:"European Commission reviewing steel safeguard quotas with potential 3-5% reduction for 2026. Hot-rolled coil and cold-rolled products directly affected. Domestic steel prices trending upward.",category:"Tariffs",severity:"High",trend:"Escalating",region:"Europe",lat:50.85,lng:4.35,corridor:"GLOBAL",friction_level:"Moderate",skf_cost_impact:"Steel is 25-30% of bearing production cost. A 5% quota reduction could increase input costs by 2-3% across European factories.",recommended_action:"Diversify steel sourcing to India (JSW, Tata) and Turkey. Negotiate long-term supply agreements before quota changes take effect."},
  {event:"US Section 232 Steel Tariffs Maintained",description:"25% steel tariffs remain in effect. EU TRQ arrangement provides limited relief but quotas frequently exhausted by mid-year. Aluminum tariffs also impacting packaging costs.",category:"Tariffs",severity:"High",trend:"Stable",region:"Americas",lat:38.9,lng:-77.0,corridor:"EU-US",friction_level:"High",skf_cost_impact:"US plants (Waukegan, SLC, Crossville) face higher domestic steel prices. EU-origin bearing imports face derivative steel tariff scrutiny.",recommended_action:"Maximize US-sourced steel for domestic production. Monitor TRQ utilization rates for timing of EU steel shipments."},
  {event:"EU Anti-Dumping Duties on Chinese Bearings",description:"EU maintaining anti-dumping duties of 30-45% on Chinese-origin ball bearings, tapered roller bearings, and certain bicycle bearings. Annual review ongoing with no indication of reduction.",category:"Anti-Dumping",severity:"Medium",trend:"Stable",region:"Europe",lat:50.85,lng:4.35,corridor:"EU-CN",friction_level:"Prohibitive",skf_cost_impact:"Protective for SKF EU manufacturing. Chinese competitors face 30-45% duty disadvantage. SKF China-to-EU internal transfers subject to related-party scrutiny.",recommended_action:"Ensure transfer pricing compliance for intra-group China-EU bearing shipments. Leverage cost advantage vs Chinese competitors in EU market."},
  {event:"China Export Controls on Germanium and Gallium",description:"Beijing restricting exports of germanium, gallium, and antimony — critical for semiconductor and advanced materials. Export licensing now required with approval taking 30-60 days.",category:"Export Controls",severity:"High",trend:"Escalating",region:"China",lat:39.9,lng:116.4,corridor:"EU-CN",friction_level:"High",skf_cost_impact:"Indirect impact through semiconductor supply for sensor-integrated bearings. Direct impact on specialty alloy availability for aerospace bearing production.",recommended_action:"Map germanium/gallium content in bearing supply chain. Qualify alternative sources from Canada, Belgium, and Japan."},
  {event:"EU-India FTA Negotiations Advancing",description:"EU-India free trade agreement negotiations progressing with target conclusion in 2026. Industrial goods chapter could reduce bearing import duties from current 7.5% to 0% over 5 years.",category:"FTA",severity:"Medium",trend:"Escalating",region:"India",lat:20.59,lng:78.96,corridor:"EU-IN",friction_level:"Moderate",skf_cost_impact:"Positive for SKF India exports to EU. Pune, Ahmedabad, Bangalore factories could serve EU market more competitively. Risk of increased Indian bearing competition in EU.",recommended_action:"Position India factories for EU export growth. Prepare competitive analysis of Indian bearing producers who would benefit from FTA."},
  {event:"Russia Sanctions — 15th EU Package in Preparation",description:"New sanctions package targeting Russian metals, chemicals, and technology sectors. Expanded circumvention measures targeting third-country re-exports through Central Asia and Turkey.",category:"Sanctions",severity:"Medium",trend:"Escalating",region:"Europe",lat:55.75,lng:37.62,corridor:"GLOBAL",friction_level:"Prohibitive",skf_cost_impact:"SKF fully exited Russia. Residual risk from third-country circumvention scrutiny. Turkish and Kazakh customer due diligence costs increasing.",recommended_action:"Strengthen KYC procedures for customers in circumvention-risk countries. Review Central Asian distributor relationships for sanctions compliance."},
  {event:"RCEP Utilization Growing for APAC Trade",description:"Regional Comprehensive Economic Partnership (RCEP) utilization rates increasing, reducing tariffs on industrial components traded between ASEAN, China, Japan, Korea, and Australia.",category:"FTA",severity:"Low",trend:"Stable",region:"China",lat:23.7,lng:120.96,corridor:"JP-CN",friction_level:"Low",skf_cost_impact:"Beneficial for intra-APAC component flows. Dalian, Wuhu bearing exports to ASEAN countries benefit from reduced duties. Nilai (Malaysia) plant gains access advantages.",recommended_action:"Maximize RCEP certificate of origin usage for APAC shipments. Review rules of origin compliance for China-ASEAN bearing flows."},
  {event:"US Anti-Dumping Review on Japanese/Chinese Bearings",description:"US Department of Commerce conducting annual review of anti-dumping duties on tapered roller bearings from China (up to 92%) and Japan (varying rates). Preliminary results expected Q3.",category:"Anti-Dumping",severity:"Low",trend:"Stable",region:"Americas",lat:38.9,lng:-77.0,corridor:"CN-US",friction_level:"Prohibitive",skf_cost_impact:"Protective for SKF US manufacturing operations. Extremely high duties on Chinese bearings virtually eliminate direct competition. Japanese competitors face moderate duties.",recommended_action:"Monitor DOC review for any rate changes. Maintain US manufacturing positioning as tariff-advantaged supplier."}
]};


const SEV={Critical:'#ef4444',High:'#f97316',Medium:'#eab308',Low:'#22c55e'};
const SO={Critical:0,High:1,Medium:2,Low:3};
const SBG={Critical:'#7f1d1d',High:'#7c2d12',Medium:'#713f12',Low:'#14532d'};
const CAT={Geopolitical:'\u{1F30D}','Natural Disaster':'\u{1F30A}','Labour/Strike':'\u270A','Logistics/Port':'\u{1F6A2}','Trade Policy':'\u{1F4CB}',Cyber:'\u{1F4BB}',Other:'\u26A0\uFE0F',Tariffs:'\u{1F4B0}','Anti-Dumping':'\u{1F6AB}','Export Controls':'\u{1F512}',Sanctions:'\u26D4',FTA:'\u{1F91D}',Currency:'\u{1F4B1}','Freight Costs':'\u{1F4E6}'};
const FRIC={Free:'#22c55e',Low:'#34d399',Moderate:'#eab308',High:'#f97316',Prohibitive:'#ef4444'};
const GU="https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// Conflict/tension zones — ISO 3166-1 numeric codes
// Active wars + high-tension regions relevant to SKF supply chains
const CONFLICT_ZONES=new Set(['804','643','364','376','275','887','760','368','422','729','736']);
// 804=Ukraine, 643=Russia, 364=Iran, 376=Israel, 275=Palestine, 887=Yemen, 760=Syria, 368=Iraq, 422=Lebanon, 729=Sudan, 736=S.Sudan

// ── 5,090 suppliers across 53 countries, aggregated by country ──
// [country, lat, lng, n_suppliers, n_supply_relationships, region, [top_categories]]
const SUP_RAW=[["Germany",51.16,10.45,957,2049,"EU",["Components","Electronics","Hydraulic/Pneumatic"]],["United States",39.83,-98.58,867,1769,"AM",["Components","MFG Services","Hydraulic/Pneumatic"]],["China",35.86,104.2,633,1739,"APAC",["Components","Hydraulic/Pneumatic","MFG Services"]],["India",20.59,78.96,541,1256,"APAC",["Components","Hydraulic/Pneumatic","Electronics"]],["France",46.23,2.21,487,957,"EU",["Components","MFG Services","Electronics"]],["Italy",41.87,12.57,407,837,"EU",["Components","MFG Services","Hydraulic/Pneumatic"]],["United Kingdom",55.38,-3.44,203,331,"EU",["Components","MFG Services","Raw Materials"]],["Bulgaria",42.73,25.49,167,198,"EU",["MFG Services","Components","Electronics"]],["Sweden",60.13,18.64,155,370,"EU",["Components","Hydraulic/Pneumatic","MFG Services"]],["Finland",61.92,25.75,117,254,"EU",["Components","Electronics","Hydraulic/Pneumatic"]],["Argentina",-38.42,-63.62,112,199,"AM",["Components","MFG Services","Electronics"]],["Brazil",-14.24,-51.93,95,150,"AM",["Hydraulic/Pneumatic","Electronics","Components"]],["Austria",47.52,14.55,90,150,"EU",["Components","Raw Materials","Hydraulic/Pneumatic"]],["Spain",40.46,-3.75,86,135,"EU",["Components","Hydraulic/Pneumatic","Electronics"]],["Mexico",23.63,-102.55,67,118,"AM",["Components","Electronics","Hydraulic/Pneumatic"]],["Czech Republic",49.82,15.47,63,115,"EU",["Components","Hydraulic/Pneumatic","Electronics"]],["Australia",-25.27,133.78,62,81,"APAC",["MFG Services","Components","Electronics"]],["Taiwan",23.7,120.96,50,71,"APAC",["Components","MFG Services","Electronics"]],["Canada",56.13,-106.35,48,63,"AM",["Electronics","Components","MFG Services"]],["Netherlands",52.13,5.29,45,60,"EU",["Components","Electronics","Hydraulic/Pneumatic"]],["South Korea",35.91,127.77,45,121,"APAC",["Components","MFG Services","Hydraulic/Pneumatic"]],["Poland",51.92,19.15,29,53,"EU",["Components","MFG Services","Electronics"]],["South Africa",-30.56,22.94,29,41,"AF",["Components","MFG Services","Hydraulic/Pneumatic"]],["Turkey",38.96,35.24,29,48,"APAC",["Components","Raw Materials","Electronics"]],["Switzerland",46.82,8.23,27,34,"EU",["Components","Electronics","MFG Services"]],["Denmark",56.26,9.5,24,34,"EU",["Components","Electronics","Hydraulic/Pneumatic"]],["Japan",36.2,138.25,22,82,"APAC",["Components","MFG Services","Raw Materials"]],["Ukraine",48.38,31.17,20,20,"EU",["Hydraulic/Pneumatic","MFG Services","Raw Materials"]],["Slovakia",48.67,19.7,15,44,"EU",["Components","MFG Services","Electronics"]],["Belgium",50.5,4.47,13,20,"EU",["Components","Raw Materials","MFG Services"]],["Indonesia",-0.79,113.92,12,13,"APAC",["Components","Electronics","MFG Services"]],["Singapore",1.35,103.82,12,25,"APAC",["Components","Raw Materials","Hydraulic/Pneumatic"]],["Romania",45.94,24.97,10,18,"EU",["Components","Chemicals","Electronics"]],["Slovenia",46.15,14.99,8,11,"EU",["Components","Electronics"]],["Hungary",47.16,19.5,7,9,"EU",["Components","Electronics","MFG Services"]],["Philippines",12.88,121.77,6,10,"APAC",["Components"]],["Portugal",39.4,-8.22,5,10,"EU",["Components","Hydraulic/Pneumatic","MFG Services"]],["Vietnam",14.06,108.28,5,10,"APAC",["Components","MFG Services"]],["Bosnia",43.92,17.68,4,27,"EU",["Components","MFG Services"]],["Croatia",45.1,15.2,4,8,"EU",["Components","MFG Services"]],["Ireland",53.14,-7.69,4,7,"EU",["Components","MFG Services","Electronics"]],["Luxembourg",49.82,6.13,4,7,"EU",["Components","Electronics"]],["Malaysia",4.21,101.98,4,5,"APAC",["Electronics","MFG Services","Raw Materials"]],["Norway",60.47,8.47,4,6,"EU",["Components","Raw Materials"]],["Thailand",15.87,100.99,4,12,"APAC",["Components","MFG Services"]],["Chile",-35.68,-71.54,3,3,"AM",["Electronics"]],["Colombia",4.57,-74.3,3,3,"AM",["Electronics"]],["Israel",31.05,34.85,2,2,"APAC",["MFG Services","Components"]],["Morocco",31.79,-7.09,2,6,"AF",["Components","Electronics"]],["Estonia",58.6,25.01,1,2,"EU",["Electronics"]],["Latvia",56.88,24.6,1,2,"EU",["MFG Services"]],["New Zealand",-40.9,174.89,1,1,"APAC",["MFG Services"]],["Serbia",44.02,21.01,1,7,"EU",["Components"]]];
const SUPPLIERS=SUP_RAW.map(([country,lat,lng,n,rows,region,cats])=>({country,lat,lng,n,rows,region,cats}));
const L1_FULL={'Comp':'Components','MFG Svc':'MFG Services','Elec':'Electronics','Hydr/Pneu':'Hydraulic/Pneumatic','Raw Mat':'Raw Materials','Chem':'Chemicals','Other':'Other'};
const SUP_CATS={"Argentina":[["Comp",134,[["Sleeves",51],["Power Transmission",25],["Std Fasteners",15],["Processed Components",9]]],["MFG Svc",28,[["Machining",15],["Surface Treatment",7],["Packaging",4],["Testing",1]]],["Raw Mat",14,[["Bars",7],["Strips",4],["Wire",2],["Polymers",1]]],["Elec",14,[["PCB & Electronics",6],["Cables & Acc",6],["Drives & Systems",2]]],["Hydr/Pneu",9,[["Hydraulic Pumps",4],["Hydraulic Valves",2],["Pneumatic Cylinders",2],["Hydraulic Aggregates",1]]]],"Australia":[["MFG Svc",61,[["MFG Sub",33],["Machining",21],["Packaging",3],["Surface Treatment",2]]],["Comp",17,[["Bearings",3],["Seals",3],["Casted Parts",3],["Lube Equipment",2]]],["Elec",2,[["Cables & Acc",1],["PCB & Electronics",1]]]],"Austria":[["Comp",65,[["Bearings",13],["Cages",8],["Seals",6],["Machined Parts",5]]],["Raw Mat",30,[["Granulates",9],["Polymers",8],["Bars",8],["Wire",3]]],["Hydr/Pneu",24,[["Pneumatic Cylinders",7],["Pneumatic Hoses",6],["Hydraulic Pumps",4],["Hydraulic Valves",3]]],["Elec",18,[["Drives & Systems",7],["PCB & Electronics",6],["Cables & Acc",5]]],["MFG Svc",13,[["Heat Treatment",5],["Surface Treatment",4],["Packaging",2],["Machining",1]]]],"Belgium":[["Raw Mat",8,[["Bars",3],["Polymers",3],["Metal Powder",1],["Compound Ingredients",1]]],["Comp",8,[["Seals",4],["Bearings",3],["Preforms For Seals",1]]],["MFG Svc",2,[["Machining",1],["Testing",1]]]],"Bosnia and Herzegovina":[["Comp",23,[["Rollers",9],["Bearing Rings",8],["Machined Parts",2],["Shields",1]]],["MFG Svc",4,[["Machining",3],["Packaging",1]]]],"Brazil":[["Hydr/Pneu",54,[["Hydraulic Pumps",13],["Hoses & Fittings",13],["Pneumatic Cylinders",13],["Hydraulic Valves",11]]],["Elec",51,[["PCB & Electronics",27],["Cables & Acc",18],["Drives & Systems",6]]],["Comp",35,[["Power Transmission",12],["Bearing Rings",3],["Seals",3],["Bearings",3]]],["MFG Svc",7,[["Machining",4],["Testing",2],["Assembling",1]]],["Raw Mat",3,[["Bars",2],["Wire",1]]]],"Bulgaria":[["MFG Svc",97,[["MFG Sub",97]]],["Comp",53,[["Processed Components",29],["Bearing Rings",6],["Inserts",4],["Balls",4]]],["Elec",29,[["PCB & Electronics",20],["Cables & Acc",7],["Drives & Systems",2]]],["Raw Mat",18,[["Wire",16],["Bars",1],["Granulates",1]]]],"Canada":[["Comp",26,[["Lube Equipment",10],["Processed Components",4],["Casted Parts",2],["Machined Parts",2]]],["Elec",26,[["PCB & Electronics",26]]],["MFG Svc",7,[["Heat Treatment",3],["Machining",2],["Surface Treatment",2]]],["Raw Mat",4,[["Bars",3],["Strips",1]]]],"China":[["Comp",1341,[["Bearing Rings",319],["Cages",127],["Bearings",121],["Seals",91]]],["Hydr/Pneu",130,[["Hoses & Fittings",76],["Hydraulic Valves",19],["Pneumatic Cylinders",15],["Hydraulic Pumps",14]]],["MFG Svc",103,[["Machining",54],["Surface Treatment",28],["Heat Treatment",8],["Testing",8]]],["Raw Mat",87,[["Raw Materials",42],["Polymers",25],["Bars",13],["Granulates",5]]],["Elec",64,[["PCB & Electronics",34],["Drives & Systems",20],["Cables & Acc",9],["Electrical And Electro",1]]],["Chem",12,[["Compounds",12]]],["Other",2,[["Direct",2]]]],"Croatia":[["Comp",6,[["Casted Parts",2],["Bearing Rings",2],["Shields",1],["Machined Parts",1]]],["MFG Svc",2,[["Machining",2]]]],"Czech Republic":[["Comp",59,[["Machined Parts",9],["Bearing Rings",8],["Bearings",7],["Seals",5]]],["Hydr/Pneu",24,[["Hydraulic Valves",11],["Hoses & Fittings",5],["Hydraulic Pumps",3],["Pneumatic Hoses",2]]],["Elec",19,[["PCB & Electronics",11],["Cables & Acc",7],["Drives & Systems",1]]],["MFG Svc",9,[["Machining",3],["Surface Treatment",2],["Packaging",1],["Heat Treatment",1]]],["Raw Mat",4,[["Bars",3],["Tubes",1]]]],"Denmark":[["Comp",24,[["Bearings",12],["Seals",4],["Composite",3],["Preforms For Seals",1]]],["Elec",4,[["PCB & Electronics",2],["Cables & Acc",1],["Drives & Systems",1]]],["Hydr/Pneu",2,[["Hoses & Fittings",1],["Pneumatic Cylinders",1]]],["Raw Mat",2,[["Polymers",1],["Tubes",1]]],["MFG Svc",2,[["Machining",2]]]],"Finland":[["Comp",120,[["Machined Parts",32],["Shields",19],["Std Fasteners",19],["Seals",12]]],["Elec",65,[["PCB & Electronics",49],["Cables & Acc",12],["Drives & Systems",4]]],["Hydr/Pneu",47,[["Hydraulic Valves",24],["Hydraulic Pumps",11],["Hoses & Fittings",11],["Pneumatic Cylinders",1]]],["Raw Mat",18,[["Bars",8],["Tubes",5],["Wire",4],["Raw Materials",1]]],["MFG Svc",4,[["Surface Treatment",2],["Packaging",1],["Machining",1]]]],"France":[["Comp",482,[["Machined Parts",139],["Std Fasteners",52],["Cages",39],["Custom Fasteners",37]]],["MFG Svc",255,[["Machining",123],["Heat Treatment",42],["Surface Treatment",39],["Assembling",15]]],["Elec",107,[["PCB & Electronics",78],["Cables & Acc",25],["Drives & Systems",4]]],["Hydr/Pneu",61,[["Hydraulic Valves",50],["Pneumatic Cylinders",5],["Pneumatic Hoses",3],["Hoses & Fittings",2]]],["Raw Mat",49,[["Bars",32],["Raw Materials",5],["Wire",4],["Tubes",4]]],["Chem",2,[["Compounds",2]]]],"Germany":[["Comp",1114,[["Machined Parts",283],["Seals",132],["Std Fasteners",99],["Injection Molding",72]]],["Elec",345,[["PCB & Electronics",232],["Drives & Systems",78],["Cables & Acc",35]]],["Hydr/Pneu",236,[["Hydraulic Valves",107],["Hydraulic Pumps",67],["Pneumatic Cylinders",32],["Hoses & Fittings",20]]],["MFG Svc",210,[["Machining",87],["Surface Treatment",50],["MFG Sub",30],["Heat Treatment",18]]],["Raw Mat",134,[["Raw Materials",43],["Bars",27],["Wire",14],["Tubes",11]]],["Chem",8,[["Compounds",7],["Chemicals, Compounds A",1]]],["Other",2,[["Direct",2]]]],"Hong Kong":[["Comp",11,[["Power Transmission",2],["Bearings",2],["Bearing Rings",1],["Custom Fasteners",1]]]],"Hungary":[["Comp",6,[["Bearing Rings",3],["Machined Parts",1],["Sensor Modules",1],["Seals",1]]]],"India":[["Comp",675,[["Machined Parts",88],["Bearing Rings",74],["Cages",71],["Shields",55]]],["Hydr/Pneu",277,[["Hoses & Fittings",97],["Hydraulic Valves",73],["Hydraulic Pumps",38],["Pneumatic Cylinders",27]]],["Elec",175,[["PCB & Electronics",84],["Cables & Acc",45],["Drives & Systems",41],["Electrical And Electro",5]]],["MFG Svc",75,[["Machining",56],["Heat Treatment",9],["Surface Treatment",5],["Moulding",2]]],["Raw Mat",49,[["Compound Ingredients",19],["Tubes",14],["Polymers",7],["Bars",7]]],["Chem",5,[["Compounds",5]]]],"Indonesia":[["Comp",11,[["Bearing Rings",3],["Balls",2],["Rollers",2],["Bearings",2]]]],"Ireland":[["Comp",4,[["Brake Systems And Comp",3],["Lube Equipment",1]]],["MFG Svc",2,[["MFG Sub",2]]]],"Italy":[["Comp",455,[["Bearing Rings",50],["Seals",44],["Machined Parts",42],["Bearings",38]]],["MFG Svc",157,[["Machining",81],["MFG Sub",35],["Heat Treatment",15],["Surface Treatment",11]]],["Hydr/Pneu",100,[["Pneumatic Cylinders",47],["Hydraulic Pumps",16],["Hydraulic Valves",14],["Pneumatic Hoses",8]]],["Elec",86,[["PCB & Electronics",41],["Drives & Systems",24],["Cables & Acc",21]]],["Raw Mat",21,[["Strips",5],["Polymers",4],["Bars",3],["Wire",3]]],["Chem",18,[["Compounds",18]]]],"Japan":[["Comp",78,[["Seals",16],["Cages",13],["Bearings",10],["Balls",10]]],["MFG Svc",3,[["Machining",2],["Surface Treatment",1]]]],"Luxembourg":[["Comp",5,[["Power Transmission",2],["Seals",1],["Bearings",1],["Casted Parts",1]]],["Elec",2,[["Drives & Systems",1],["PCB & Electronics",1]]]],"Macao":[["Comp",4,[["Lube Equipment",3],["Machined Parts",1]]]],"Malaysia":[["MFG Svc",2,[["Machining",2]]],["Elec",2,[["Cables & Acc",1],["PCB & Electronics",1]]]],"Mexico":[["Comp",43,[["Seals",7],["Bearing Rings",6],["Std Fasteners",4],["Processed Components",4]]],["Elec",30,[["Cables & Acc",15],["PCB & Electronics",10],["Drives & Systems",5]]],["Hydr/Pneu",19,[["Hydraulic Aggregates",6],["Pneumatic Cylinders",5],["Hydraulic Pumps",4],["Pneumatic Hoses",3]]],["Raw Mat",12,[["Polymers",7],["Granulates",3],["Bars",1],["Raw Materials",1]]],["Chem",8,[["Compounds",8]]],["MFG Svc",6,[["Machining",2],["Heat Treatment",2],["Surface Treatment",1],["Testing",1]]]],"Morocco":[["Comp",3,[["Machined Parts",2],["Shields",1]]],["Elec",2,[["Drives & Systems",1],["PCB & Electronics",1]]]],"Netherlands":[["Comp",36,[["Processed Components",10],["Machined Parts",9],["Bearings",6],["Seals",3]]],["Elec",9,[["PCB & Electronics",8],["Drives & Systems",1]]],["Hydr/Pneu",7,[["Hydraulic Pumps",2],["Hydraulic Valves",2],["Hoses & Fittings",1],["Pneumatic Hoses",1]]],["Raw Mat",3,[["Wire",1],["Granulates",1],["Bars",1]]],["Other",2,[["Direct",2]]],["Chem",2,[["Compounds",2]]]],"Norway":[["Comp",5,[["Bearings",3],["Custom Fasteners",1],["Sleeves",1]]]],"Peru":[["Elec",3,[["Cables & Acc",2],["PCB & Electronics",1]]],["MFG Svc",2,[["MFG Sub",2]]]],"Philippines":[["Comp",10,[["Bearings",4],["Power Transmission",2],["Seals",2],["Sensor Modules",1]]]],"Poland":[["Comp",37,[["Balls",7],["Cages",5],["Machined Parts",4],["Shields",4]]],["MFG Svc",8,[["MFG Sub",3],["Heat Treatment",2],["Surface Treatment",2],["Machining",1]]],["Hydr/Pneu",3,[["Pneumatic Cylinders",2],["Hydraulic Pumps",1]]],["Elec",3,[["Cables & Acc",2],["PCB & Electronics",1]]],["Raw Mat",2,[["Bars",1],["Tubes",1]]]],"Portugal":[["Comp",8,[["Lube Equipment",4],["Injection Molding",1],["Machined Parts",1],["Springs",1]]]],"Romania":[["Comp",14,[["Rings For Cages",3],["Cages",3],["Injection Molding",3],["Machined Parts",1]]],["Chem",2,[["Compounds",2]]]],"Serbia":[["Comp",7,[["Bearings",3],["Machined Parts",1],["Bearing Rings",1],["Casted Parts",1]]]],"Singapore":[["Comp",16,[["Seals",5],["Lube Equipment",3],["Machined Parts",3],["Injection Molding",2]]],["Raw Mat",4,[["Polymers",2],["Bars",1],["Compound Ingredients",1]]],["Hydr/Pneu",2,[["Hoses & Fittings",2]]],["MFG Svc",2,[["MFG Sub",1],["Packaging",1]]]],"Slovakia":[["Comp",36,[["Cages",9],["Bearing Rings",6],["Balls",4],["Composite",2]]],["MFG Svc",4,[["Machining",3],["Testing",1]]],["Elec",2,[["Cables & Acc",1],["PCB & Electronics",1]]]],"Slovenia":[["Comp",10,[["Machined Parts",2],["Injection Molding",2],["Seals",2],["Processed Components",1]]]],"South Africa":[["Comp",15,[["Seals",4],["Shields",2],["Preforms For Seals",2],["Machined Parts",1]]],["MFG Svc",13,[["MFG Sub",8],["Machining",4],["Heat Treatment",1]]],["Hydr/Pneu",7,[["Hydraulic Pumps",5],["Hoses & Fittings",1],["Hydraulic Valves",1]]],["Elec",6,[["PCB & Electronics",6]]]],"South Korea":[["Comp",105,[["Bearing Rings",27],["Bearings",9],["Cages",9],["Seals",8]]],["MFG Svc",9,[["Packaging",4],["Testing",3],["Machining",2]]],["Hydr/Pneu",4,[["Hydraulic Pumps",4]]],["Elec",3,[["PCB & Electronics",2],["Drives & Systems",1]]]],"Spain":[["Comp",78,[["Seals",13],["Bearings",11],["Power Transmission",10],["Machined Parts",9]]],["Hydr/Pneu",39,[["Pneumatic Hoses",19],["Pneumatic Cylinders",7],["Hydraulic Valves",5],["Hydraulic Pumps",4]]],["Elec",11,[["PCB & Electronics",7],["Cables & Acc",2],["Drives & Systems",2]]],["Raw Mat",4,[["Polymers",4]]],["Chem",2,[["Compounds",2]]]],"Sweden":[["Comp",218,[["Machined Parts",33],["Seals",25],["Cages",23],["Bearings",20]]],["Hydr/Pneu",52,[["Hoses & Fittings",17],["Hydraulic Valves",15],["Pneumatic Cylinders",6],["Hydraulic Pumps",5]]],["MFG Svc",42,[["Machining",13],["Heat Treatment",10],["Surface Treatment",10],["MFG Sub",5]]],["Raw Mat",35,[["Bars",13],["Tubes",9],["Wire",6],["Raw Materials",3]]],["Elec",21,[["PCB & Electronics",13],["Drives & Systems",6],["Cables & Acc",2]]],["Chem",2,[["Compounds",2]]]],"Switzerland":[["Comp",25,[["Seals",10],["Bearings",3],["Machined Parts",2],["Std Fasteners",2]]],["MFG Svc",3,[["Machining",2],["Surface Treatment",1]]],["Elec",3,[["PCB & Electronics",2],["Cables & Acc",1]]],["Raw Mat",2,[["Granulates",2]]]],"Taiwan":[["Comp",40,[["Seals",10],["Machined Parts",5],["Lube Equipment",5],["Bearings",4]]],["MFG Svc",24,[["Assembling",13],["Packaging",8],["Machining",2],["MFG Sub",1]]],["Elec",4,[["Drives & Systems",2],["PCB & Electronics",2]]],["Hydr/Pneu",3,[["Hoses & Fittings",1],["Hydraulic Valves",1],["Hydraulic Pumps",1]]]],"Thailand":[["Comp",9,[["Balls",8],["Seals",1]]],["MFG Svc",3,[["Quality Inspection",1],["Machining",1],["Packaging",1]]]],"Turkey":[["Comp",39,[["Seals",10],["Power Transmission",8],["Bearings",8],["Suspension Systems And",7]]],["Raw Mat",4,[["Strips",2],["Bars",1],["Polymers",1]]],["Elec",3,[["PCB & Electronics",1],["Cables & Acc",1],["Drives & Systems",1]]],["MFG Svc",2,[["MFG Sub",1],["Quality Inspection",1]]]],"Ukraine":[["Hydr/Pneu",15,[["Hydraulic And Pneumati",15]]],["Raw Mat",2,[["Bars",1],["Wire",1]]],["MFG Svc",2,[["MFG Sub",1],["Machining",1]]]],"Undefined/Undefined":[["Comp",136,[["Machined Parts",23],["Sleeves",16],["Std Fasteners",16],["Processed Components",12]]],["MFG Svc",86,[["MFG Sub",29],["Surface Treatment",26],["Machining",21],["Heat Treatment",3]]],["Raw Mat",36,[["Bars",10],["Polymers",8],["Raw Materials",7],["Wire",6]]],["Elec",18,[["PCB & Electronics",12],["Drives & Systems",3],["Cables & Acc",3]]],["Hydr/Pneu",4,[["Hydraulic Valves",2],["Hydraulic Pumps",1],["Hoses & Fittings",1]]],["Chem",2,[["Compounds",2]]]],"United Kingdom":[["Comp",205,[["Seals",29],["Custom Fasteners",22],["Machined Parts",20],["Bearings",17]]],["MFG Svc",57,[["Machining",29],["Surface Treatment",18],["Heat Treatment",5],["Testing",3]]],["Raw Mat",36,[["Bars",23],["Raw Materials",3],["Tubes",2],["Compound Ingredients",2]]],["Hydr/Pneu",16,[["Pneumatic Cylinders",5],["Hydraulic Valves",5],["Hydraulic Pumps",2],["Pneumatic Hoses",2]]],["Elec",14,[["PCB & Electronics",12],["Cables & Acc",2]]],["Other",2,[["Direct",2]]]],"United States":[["Comp",1029,[["Machined Parts",158],["Seals",129],["Std Fasteners",117],["Lube Equipment",75]]],["MFG Svc",279,[["MFG Sub",68],["Surface Treatment",66],["Machining",56],["Heat Treatment",51]]],["Hydr/Pneu",159,[["Hydraulic Valves",73],["Hydraulic Pumps",28],["Hoses & Fittings",22],["Pneumatic Cylinders",20]]],["Elec",154,[["PCB & Electronics",116],["Cables & Acc",19],["Drives & Systems",19]]],["Raw Mat",132,[["Bars",62],["Polymers",30],["Tubes",12],["Wire",10]]],["Chem",14,[["Compounds",14]]],["Other",2,[["Direct",2]]]],"Vietnam":[["Comp",9,[["Balls",3],["Bearings",3],["Seals",2],["Shields",1]]]]};
const maxSup=Math.max(...SUPPLIERS.map(s=>s.n));

// Supply Chain Graph: factory → {suppliers:[countries], routes:[route indices], bu, inputs}
const SUPPLY_GRAPH={
  'Schweinfurt':{sup:['Germany','Austria','Italy','Czech Republic','India','China'],inputs:['Steel rings','Roller elements','Cages'],bu:'Industrial'},
  'Gothenburg MFG':{sup:['Sweden','Germany','Finland','Italy','France'],inputs:['Steel','Components','Seals'],bu:'Industrial'},
  'Hofors':{sup:['Sweden','Finland','Austria'],inputs:['Steel billets','Wire rod'],bu:'Industrial'},
  'Katrineholm':{sup:['Sweden','Germany','Finland'],inputs:['Steel','Cages','Rollers'],bu:'Industrial'},
  'Steyr':{sup:['Austria','Germany','Italy','Czech Republic'],inputs:['Steel rings','Precision parts'],bu:'Industrial'},
  'Pune - Chakan':{sup:['India','Japan','China','Germany'],inputs:['Steel','Forgings','Cages'],bu:'Industrial'},
  'Ahmedabad':{sup:['India','Japan','China'],inputs:['Steel','Components'],bu:'Industrial'},
  'Dalian':{sup:['China','Japan','South Korea'],inputs:['Steel rings','Components'],bu:'Industrial'},
  'Xinchang (SXC)':{sup:['China','Japan','South Korea'],inputs:['Steel','Rare earth','Components'],bu:'Industrial'},
  'Yuyao (NGBC)':{sup:['China','Japan'],inputs:['Steel','Cages','Rollers'],bu:'Industrial'},
  'Nilai':{sup:['Malaysia','China','Japan','India'],inputs:['Steel','Components'],bu:'Industrial'},
  'Kings Lynn':{sup:['United Kingdom','Germany','Sweden'],inputs:['Steel','Components'],bu:'Industrial'},
  'Poznan':{sup:['Poland','Germany','Czech Republic','Slovakia'],inputs:['Steel','Cages','Components'],bu:'Industrial'},
  'Flowery Branch':{sup:['United States','Mexico','Canada'],inputs:['Steel','Components','Electronics'],bu:'Industrial'},
  'Waukegan, IL':{sup:['United States','Canada','Mexico'],inputs:['Steel rings','Components'],bu:'Industrial'},
  'Salt Lake City':{sup:['United States','Canada','Japan'],inputs:['Steel','Precision parts'],bu:'Industrial'},
  'Crossville, TN':{sup:['United States','Mexico'],inputs:['Steel','Components'],bu:'Industrial'},
  'Landskrona':{sup:['Sweden','Germany','Italy','Finland'],inputs:['Rubber compounds','Metal inserts','Springs'],bu:'SIS Seals'},
  'Bietigheim':{sup:['Germany','Italy','Austria','France'],inputs:['Rubber','Polymer compounds','Metal parts'],bu:'SIS Seals'},
  'Judenburg':{sup:['Austria','Germany','Italy'],inputs:['Rubber','Metal inserts'],bu:'SIS Seals'},
  'Airasca':{sup:['Italy','Germany','France'],inputs:['Steel','Precision parts','Electronics'],bu:'Industrial'},
  'Massa':{sup:['Italy','Germany'],inputs:['Steel','Components'],bu:'Industrial'},
  'Cassino':{sup:['Italy','Germany','France'],inputs:['Steel','Components'],bu:'Industrial'},
  'Cormano':{sup:['Italy','Germany','Sweden'],inputs:['Lubricants','Chemicals','Packaging'],bu:'SIS Lubrication'},
  'Landvetter':{sup:['Sweden','Germany','Finland'],inputs:['Lubricants','Equipment parts'],bu:'SIS Lubrication'},
  'Linkoping':{sup:['Sweden','Germany','Finland'],inputs:['Lubricants','Components','Electronics'],bu:'SIS Lubrication'},
  'Berlin/Walldorf':{sup:['Germany','Italy','France'],inputs:['Lubricants','Chemicals'],bu:'SIS Lubrication'},
  'Muurame':{sup:['Finland','Sweden','Germany'],inputs:['Components','Electronics','Hydraulic parts'],bu:'SIS Lubrication'},
  'Lons-Le-Saunier':{sup:['France','Germany','Italy','United Kingdom'],inputs:['Specialty steel','Precision parts'],bu:'SIS Aerospace'},
  'Valenciennes':{sup:['France','Germany','United Kingdom'],inputs:['Steel','Components'],bu:'SIS Aerospace'},
  'Falconer, NY':{sup:['United States','Canada','Japan'],inputs:['Specialty alloys','Precision parts'],bu:'SIS Aerospace'},
  'Muskegon, MI':{sup:['United States','Canada'],inputs:['Specialty steel','Components'],bu:'SIS Aerospace'},
  'Calgary, AB':{sup:['Canada','United States'],inputs:['Magnetic materials','Components'],bu:'SIS Magnetics'},
  'Tanger':{sup:['Morocco','France','Spain','Germany'],inputs:['Magnetic materials','Components'],bu:'SIS Magnetics'},
  'Rosario':{sup:['Argentina','Brazil','Germany'],inputs:['Lubricants','Components'],bu:'SIS Lubrication'},
};
// Map routes to chokepoints/regions they pass through
const ROUTE_ZONES={};
// Disruption region → affected route corridors mapping
const DISRUPTION_IMPACT={
  'Europe':['EU-CN','EU-US','EU-ASEAN','EU-ME','EU-IN','EU-BR','CN-EU'],
  'Middle East':['EU-CN','EU-ASEAN','EU-ME','EU-IN','CN-EU'],
  'China':['EU-CN','CN-US','CN-ASEAN','CN-EU','JP-CN'],
  'India':['EU-IN'],
  'Americas':['EU-US','CN-US','EU-BR'],
  'Africa':['EU-CN','EU-IN','EU-ASEAN'], // routes pass Cape
  'Global':['EU-CN','EU-US','CN-US','EU-IN','EU-ASEAN','EU-ME','EU-BR','CN-EU'],
};
// Compute impact chain for a disruption
function computeImpact(disruption, routeData){
  const region=disruption.region||'Global';
  const affectedCorridors=new Set(DISRUPTION_IMPACT[region]||[]);
  // Find affected routes
  const affRoutes=routeData.map((r,i)=>affectedCorridors.has(r.corridor)?i:null).filter(x=>x!==null);
  // Find origin factories from affected routes
  const affFactories=new Set();
  affRoutes.forEach(ri=>{const origin=routeData[ri].origin;if(origin)affFactories.add(origin)});
  // Find all factories in affected region
  const regionMap={'Europe':'EU','Middle East':'MEA','China':'APAC','India':'APAC','Americas':'AM','Africa':'AF'};
  const affRegion=regionMap[region];
  // Find supplier countries feeding affected factories
  const affSuppliers=new Set();
  affFactories.forEach(f=>{const g=SUPPLY_GRAPH[f];if(g)g.sup.forEach(s=>affSuppliers.add(s))});
  // Count impact
  return {routes:affRoutes,factories:[...affFactories],suppliers:[...affSuppliers],region:affRegion,corridors:[...affectedCorridors]};
}

function topoF(topo,name){const tf=topo.transform;const dec=topo.arcs.map(a=>{let x=0,y=0;return a.map(([dx,dy])=>{x+=dx;y+=dy;return[x*tf.scale[0]+tf.translate[0],y*tf.scale[1]+tf.translate[1]]})});const da=i=>i<0?dec[~i].slice().reverse():dec[i].slice();const ring=ids=>{const c=[];ids.forEach(i=>{const a=da(i);a.forEach((p,j)=>{if(j>0||!c.length)c.push(p)})});return c};const dg=g=>{if(g.type==='Polygon')return{type:'Polygon',coordinates:g.arcs.map(ring)};if(g.type==='MultiPolygon')return{type:'MultiPolygon',coordinates:g.arcs.map(a=>a.map(ring))};return g};const obj=topo.objects[name];if(obj.type==='GeometryCollection')return{type:'FeatureCollection',features:obj.geometries.map(g=>({type:'Feature',id:g.id,geometry:dg(g),properties:g.properties||{}}))};return{type:'FeatureCollection',features:[{type:'Feature',geometry:dg(obj),properties:{}}]}}
function stripC(s){if(typeof s!=='string')return s;return s.replace(/<\/?(?:cite|antml:cite)[^>]*>/gi,'').replace(/\s{2,}/g,' ').trim()}
function cleanI(a){if(!Array.isArray(a))return a;return a.map(o=>{const r={};for(const[k,v]of Object.entries(o))r[k]=stripC(v);return r})}
function parseAI(data){const txt=data.content?.filter(b=>b.type==="text").map(b=>b.text).join("\n")||"";const c=txt.replace(/```json|```/g,"").trim();try{return cleanI(JSON.parse(c))}catch{}const f=c.indexOf('['),l=c.lastIndexOf(']');if(f!==-1&&l>f)try{return cleanI(JSON.parse(c.substring(f,l+1)))}catch{}const objs=[];const re=/\{[^{}]*"(?:event|risk)"[^{}]*\}/g;let m;while((m=re.exec(c))!==null)try{objs.push(JSON.parse(m[0]))}catch{}if(objs.length)return cleanI(objs);return null}

const tC={};const rC={};const cC={};
SITES.forEach(s=>{tC[s.type]=(tC[s.type]||0)+1;rC[s.region]=(rC[s.region]||0)+1;cC[s.country]=(cC[s.country]||0)+1});
const nC=Object.keys(cC).length;

const CSS=`
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap');
@keyframes spc{0%,100%{r:8;opacity:.35}50%{r:18;opacity:.08}}
@keyframes sph{0%,100%{r:7;opacity:.3}50%{r:15;opacity:.06}}
@keyframes spm{0%,100%{r:6;opacity:.25}50%{r:12;opacity:.04}}
@keyframes spl{0%,100%{r:5;opacity:.2}50%{r:10;opacity:.03}}
@keyframes shim{0%{background-position:200% 0}100%{background-position:-200% 0}}
@keyframes sli{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes slo{from{transform:translateX(0);opacity:1}to{transform:translateX(100%);opacity:0}}
@keyframes sfu{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes scb{0%{transform:scaleX(0)}100%{transform:scaleX(1)}}
@keyframes sc-scan-slide{0%{opacity:.2;transform:translateX(-30%)}50%{opacity:1;transform:translateX(0%)}100%{opacity:.2;transform:translateX(30%)}}
.sc-din{animation:sli 280ms cubic-bezier(.16,1,.3,1) both}
.sc-dout{animation:slo 200ms cubic-bezier(.7,0,.84,0) both}
.sc-ce{animation:sfu 300ms cubic-bezier(.16,1,.3,1) both}
.sc-sh{background:linear-gradient(90deg,transparent,rgba(255,255,255,.06),transparent);background-size:200% 100%;animation:shim 2s ease infinite}
.sc-bar{transform-origin:left;animation:scb 45s linear}
.sc-s::-webkit-scrollbar{width:4px}.sc-s::-webkit-scrollbar-track{background:transparent}.sc-s::-webkit-scrollbar-thumb{background:#1e293b;border-radius:4px}
`;
const F="'DM Sans',-apple-system,sans-serif",FM="'JetBrains Mono',monospace";

function relTime(d){if(!d)return'';const s=Math.floor((Date.now()-d.getTime())/1000);if(s<60)return 'just now';if(s<3600)return Math.floor(s/60)+'m ago';if(s<86400)return Math.floor(s/3600)+'h ago';return Math.floor(s/86400)+'d ago'}

function SiteShape({shape,x,y,r,sr,color,ih,bo,inv}){
  const sw=Math.max(.3,(ih?1.5:.8)*inv);const fl=ih?"url(#gl)":"";const op=ih?1:bo;
  if(shape==='tri')return <polygon points={`${x},${y-r} ${x+r*.87},${y+r*.5} ${x-r*.87},${y+r*.5}`} fill={color} stroke={ih?'#fff':color} strokeWidth={sw} filter={fl} opacity={op}/>;
  if(shape==='star')return <g><circle cx={x} cy={y} r={r*.7} fill={color} stroke={ih?'#fff':color+'aa'} strokeWidth={Math.max(.3,.8*inv)} filter={fl} opacity={op}/><circle cx={x} cy={y} r={r*1.2} fill="none" stroke={color} strokeWidth={Math.max(.2,.4*inv)} strokeDasharray={`${Math.max(1,2*inv)},${Math.max(1,2*inv)}`} opacity={.4}/></g>;
  if(shape==='dia')return <rect x={x-r*.6} y={y-r*.6} width={r*1.2} height={r*1.2} rx={Math.max(.3,inv)} fill={color} stroke={ih?'#fff':color+'aa'} strokeWidth={Math.max(.2,.5*inv)} transform={`rotate(45,${x},${y})`} filter={fl} opacity={op}/>;
  if(shape==='sq')return <rect x={x-sr*1.1} y={y-sr*1.1} width={sr*2.2} height={sr*2.2} rx={Math.max(.3,inv)} fill={color} stroke={ih?'#fff':color+'88'} strokeWidth={Math.max(.2,.5*inv)} filter={fl} opacity={op}/>;
  return <circle cx={x} cy={y} r={ih?sr*1.3:sr} fill={color} stroke={ih?'#fff':''} strokeWidth={ih?Math.max(.3,inv):0} opacity={op}/>;
}

// Event lifecycle: generate stable ID from event name + region
function eventId(d){return(d.event||d.risk||'')+'|'+(d.region||'')}

export default function App(){
  const[mode,setMode]=useState(null),[loading,setLoading]=useState(false),[items,setItems]=useState(null),[error,setError]=useState(null);
  const[sel,setSel]=useState(null),[sTime,setSTime]=useState(null),[dOpen,setDOpen]=useState(false),[dClosing,setDClosing]=useState(false);
  const[groupBy,setGroupBy]=useState('severity');
  const[land,setLand]=useState(null),[zK,setZK]=useState(1);
  const zR=useRef({k:1,x:0,y:0}),raf=useRef(null),[hS,setHS]=useState(null),[hD,setHD]=useState(null),[hSup,setHSup]=useState(null);
  const[selSite,setSelSite]=useState(null),[selRt,setSelRt]=useState(null),[selSupC,setSelSupC]=useState(null),[clickPos,setClickPos]=useState({x:0,y:0});
  const[edits,setEdits]=useState({});
  const[editing,setEditing]=useState(null);
  const[scanPct,setScanPct]=useState(0);
  // Event registry: {[eventId]: {status:'active'|'watching'|'archived', archivedSev, firstSeen, lastSeen, scanCount, ...}}
  const[registry,setRegistry]=useState({});
  const[showArchived,setShowArchived]=useState(false);
  // Tickets: {[eventId]: {owner, status, actions:[{text,owner,due,status,created}], notes, due}}
  const[tickets,setTickets]=useState({});
  const[assignFilter,setAssignFilter]=useState(null); // null=all, 'me'=Jonas, or team id
  const[showAssign,setShowAssign]=useState(null); // eventId showing assignment dropdown
  const[supExpand,setSupExpand]=useState({}); // {L1key: true} for expanded L2 categories
  const[tF,setTF]=useState(()=>{const f={};Object.keys(TYPE_CFG).forEach(k=>f[k]=true);return f});
  const[buF,setBuF]=useState(()=>{const f={};Object.keys(BU_CFG).forEach(k=>f[k]=true);return f});
  const[rF,setRF]=useState(()=>{const f={};Object.keys(REGION_CFG).forEach(k=>f[k]=true);return f});
  const[sR,setSR]=useState(true),[sC,setSC]=useState(true),[fO,setFO]=useState(false),[sSup,setSSup]=useState(true);
  const svg=useRef(),gR=useRef(),cR=useRef(),[dm,setDm]=useState({w:1200,h:700});

  useEffect(()=>{const id='sc-mon-css';if(!document.getElementById(id)){const s=document.createElement('style');s.id=id;s.textContent=CSS;document.head.appendChild(s)}return()=>{}},[]);

  // Load persisted scan results and registry on mount
  useEffect(()=>{
    (async()=>{try{
      const r=await window.storage.get('scan-data');
      if(r&&r.value){
        const d=JSON.parse(r.value);
        if(d.items&&d.items.length){setItems(d.items);setMode(d.mode||null);setSTime(new Date(d.time));setDOpen(false)}
      }
      const reg=await window.storage.get('event-registry');
      if(reg&&reg.value)setRegistry(JSON.parse(reg.value));
      const ed=await window.storage.get('event-edits');
      if(ed&&ed.value)setEdits(JSON.parse(ed.value));
      const tk=await window.storage.get('event-tickets');
      if(tk&&tk.value)setTickets(JSON.parse(tk.value));
    }catch(e){/* no saved data */}})();
  },[]);
  // Persist registry, edits, and tickets on change
  useEffect(()=>{if(Object.keys(registry).length)try{window.storage.set('event-registry',JSON.stringify(registry))}catch(e){}},[registry]);
  useEffect(()=>{if(Object.keys(edits).length)try{window.storage.set('event-edits',JSON.stringify(edits))}catch(e){}},[edits]);
  useEffect(()=>{if(Object.keys(tickets).length)try{window.storage.set('event-tickets',JSON.stringify(tickets))}catch(e){}},[tickets]);
  useEffect(()=>{fetch(GU).then(r=>r.json()).then(t=>setLand(topoF(t,'countries'))).catch(()=>{})},[]);
  useEffect(()=>{const ro=new ResizeObserver(e=>{const{width:w,height:h}=e[0].contentRect;setDm({w,h})});if(cR.current)ro.observe(cR.current);return()=>ro.disconnect()},[]);
  useEffect(()=>{
    if(!svg.current)return;
    const z=d3.zoom().scaleExtent([1,20]).translateExtent([[0,0],[dm.w,dm.h]])
      .wheelDelta(e=>-e.deltaY*(e.deltaMode===1?0.03:e.deltaMode?1:0.001))
      .filter(e=>{if(e.target.closest?.('[data-click]'))return false;return(!e.ctrlKey||e.type==='wheel')&&!e.button})
      .on('zoom',e=>{if(gR.current)gR.current.setAttribute('transform',e.transform.toString());zR.current={k:e.transform.k,x:e.transform.x,y:e.transform.y};setHS(null);setHD(null);setHSup(null);setSelSite(null);setSelRt(null);setSelSupC(null);if(raf.current)cancelAnimationFrame(raf.current);raf.current=requestAnimationFrame(()=>setZK(e.transform.k))});
    d3.select(svg.current).call(z);
    return()=>{d3.select(svg.current).on('.zoom',null);if(raf.current)cancelAnimationFrame(raf.current)};
  },[dm]);

  const proj=useMemo(()=>d3.geoNaturalEarth1().fitSize([dm.w-40,dm.h-40],{type:"Sphere"}).translate([dm.w/2,dm.h/2]),[dm]);
  const pg=useMemo(()=>d3.geoPath(proj),[proj]);
  const gr=useMemo(()=>d3.geoGraticule10(),[]);
  const pt=useCallback((la,ln)=>proj([ln,la]),[proj]);
  const arcs=useMemo(()=>RTS.map(r=>{
    if(r.pts){
      // Sea routes: project waypoints, smooth curve through them
      const projected=r.pts.map(([la,ln])=>proj([ln,la])).filter(Boolean);
      return d3.line().curve(d3.curveCardinal.tension(0.7))(projected);
    }
    // Air routes: great circle interpolation
    const i=d3.geoInterpolate([r.f[1],r.f[0]],[r.t[1],r.t[0]]);
    return d3.line().curve(d3.curveBasis)(Array.from({length:25},(_,j)=>proj(i(j/24))));
  }),[proj]);

  // Build corridor friction from trade scan results
  const corridorFriction=useMemo(()=>{
    if(!items||mode!=='trade')return {};
    const cf={};
    items.forEach(d=>{
      if(d.corridor&&d.friction_level){
        const existing=cf[d.corridor];
        const rank={Prohibitive:4,High:3,Moderate:2,Low:1,Free:0};
        if(!existing||rank[d.friction_level]>(rank[existing]||0))cf[d.corridor]=d.friction_level;
      }
    });
    return cf;
  },[items,mode]);
  const vis=useMemo(()=>SITES.filter(s=>tF[s.type]&&rF[s.region]&&(s.type!=='mfg'||!s.bu||buF[s.bu])).sort((a,b)=>(TYPE_CFG[b.type]?.pri||9)-(TYPE_CFG[a.type]?.pri||9)),[tF,rF,buF]);
  // Supply chain impact for selected disruption
  const impact=useMemo(()=>{if(sel===null||!items||!items[sel])return null;return computeImpact(items[sel],RTS)},[sel,items]);

  const closeD=useCallback(()=>{setDClosing(true);setTimeout(()=>{setDOpen(false);setDClosing(false)},200)},[]);
  const scan=async m=>{
    setLoading(true);setError(null);setMode(m);setSel(null);setItems(null);setScanPct(0);
    setDOpen(true);setDClosing(false);
    const data=SAMPLE[m];if(!data){setError('Unknown mode');setLoading(false);return}
    const chunks=[data.slice(0,3),data.slice(3,6),data.slice(6,8),data.slice(8)];
    let all=[];
    for(let i=0;i<chunks.length;i++){
      await new Promise(r=>setTimeout(r,800+Math.random()*600));
      all=[...all,...chunks[i]];
      const sorted=[...all].sort((a,b)=>(SO[a.severity||a.risk_level]||3)-(SO[b.severity||b.risk_level]||3));
      setItems(sorted);
      setScanPct(Math.round(((i+1)/chunks.length)*100));
    }
    // Merge with event registry
    const now=new Date().toISOString();const newReg={...registry};
    const detectedIds=new Set(all.map(d=>eventId(d)));
    // Update detected events
    all.forEach(d=>{const id=eventId(d);const prev=newReg[id];const sev=d.severity||d.risk_level||'Medium';
      if(!prev){
        newReg[id]={status:'active',firstSeen:now,lastSeen:now,scanCount:1,lastSev:sev,_new:true};
      }else{
        const wasArchived=prev.status==='archived';
        const sevRank={Critical:4,High:3,Medium:2,Low:1};
        const escalated=wasArchived&&(sevRank[sev]||0)>(sevRank[prev.archivedSev]||0);
        if(wasArchived&&!escalated){/* stay archived */}
        else{
          newReg[id]={...prev,status:escalated?'active':prev.status==='watching'?'watching':'active',
            lastSeen:now,scanCount:(prev.scanCount||0)+1,lastSev:sev,
            _new:!prev.firstSeen,_returning:!!prev.firstSeen&&prev.status!=='watching',
            _reEmerged:escalated,_reEmergedFrom:escalated?prev.archivedSev:null};
        }
      }
    });
    // Flag not-detected events that were active or watched
    Object.keys(newReg).forEach(id=>{
      if(!detectedIds.has(id)&&(newReg[id].status==='active'||newReg[id].status==='watching')){
        newReg[id]={...newReg[id],_notDetected:true};
      }else if(detectedIds.has(id)){
        newReg[id]={...newReg[id],_notDetected:false};
      }
    });
    setRegistry(newReg);
    setSTime(new Date());
    try{await window.storage.set('scan-data',JSON.stringify({items:all,mode:m,time:now}))}catch(e){}
    setLoading(false);setTimeout(()=>setScanPct(0),600);
  };

  const grouped=useMemo(()=>{if(!items)return{};const g={};
    const active=items.filter(d=>{const r=registry[eventId(d)];if(r&&r.status==='archived')return false;
      if(assignFilter){const tk=tickets[eventId(d)];if(assignFilter==='unassigned')return !tk||!tk.owner;
        return tk&&tk.owner===assignFilter}return true});
    if(groupBy==='severity'){const sevOrder=['Critical','High','Medium','Low'];active.forEach((d,i)=>{const sv=d.severity||d.risk_level||'Medium';if(!g[sv])g[sv]=[];g[sv].push({...d,_i:items.indexOf(d)})});const s={};sevOrder.forEach(k=>{if(g[k])s[k]=g[k]});Object.keys(g).forEach(k=>{if(!s[k])s[k]=g[k]});return s}
    else{active.forEach((d,i)=>{const r=d.region||'Global';if(!g[r])g[r]=[];g[r].push({...d,_i:items.indexOf(d)})});const s={};Object.entries(g).sort(([,a],[,b])=>Math.min(...a.map(x=>SO[x.severity||x.risk_level]||3))-Math.min(...b.map(x=>SO[x.severity||x.risk_level]||3))).forEach(([k,v])=>s[k]=v);return s}
  },[items,groupBy,registry,tickets,assignFilter]);
  const rsc=useMemo(()=>{const m={'Europe':'EU','Middle East':'MEA','China':'APAC','India':'APAC','Americas':'AM','Africa':'AF','Global':null};const o={};if(!items)return o;const regions=new Set(items.map(d=>d.region||'Global'));regions.forEach(r=>{const k=m[r];o[r]=k?SITES.filter(s=>s.region===k).length:SITES.length});return o},[items]);

  // Executive Brief — auto-generated from structured results
  // Exposure scores per manufacturing site — computed from active disruptions × supply chain overlap
  const exposureScores=useMemo(()=>{
    if(!items)return{};const scores={};
    const sevW={Critical:4,High:3,Medium:2,Low:1};
    Object.entries(SUPPLY_GRAPH).forEach(([site,graph])=>{
      let score=0;const threats=[];
      items.forEach(d=>{
        const impact=computeImpact(d,RTS);
        const hitFactory=impact.factories.includes(site);
        const hitSupplier=graph.sup.some(s=>impact.suppliers.includes(s));
        const hitRoute=impact.routes.some(ri=>RTS[ri]?.origin===site);
        if(hitFactory||hitSupplier||hitRoute){
          const w=sevW[d.severity||d.risk_level]||2;
          const directness=hitFactory?1.0:hitRoute?0.7:0.4;
          score+=w*directness;
          threats.push({event:d.event||d.risk,severity:d.severity||d.risk_level,direct:hitFactory,route:hitRoute,supplier:hitSupplier});
        }
      });
      if(score>0)scores[site]={score:Math.round(score*10)/10,level:score>=8?'Critical':score>=5?'High':score>=2?'Medium':'Low',threats};
    });
    return scores;
  },[items]);

  // Supply chain view state
  const[scView,setScView]=useState(null); // site name for supply chain overlay
  const[impactView,setImpactView]=useState(null); // disruption index for impact chain

  const execBrief=useMemo(()=>{
    if(!items||!items.length)return null;
    const sevCounts={Critical:0,High:0,Medium:0,Low:0};
    const regions={};const actions=[];const escalating=[];
    items.forEach(d=>{
      const sv=d.severity||d.risk_level;if(sv)sevCounts[sv]=(sevCounts[sv]||0)+1;
      const r=d.region||'Global';regions[r]=(regions[r]||0)+1;
      const act=d.recommended_action||d.watchpoint;if(act)actions.push(act);
      if(d.trend==='Escalating')escalating.push(d.event||d.risk);
    });
    const topRegion=Object.entries(regions).sort((a,b)=>b[1]-a[1])[0];
    const totalSites=topRegion?rsc[topRegion[0]]||0:0;
    return {sevCounts,regions,topRegion,totalSites,escalating,actions:actions.slice(0,3),total:items.length};
  },[items,rsc]);

  const inv=1/zK,sr=Math.max(1,3*inv),mr=Math.max(1.5,4.5*inv),cs=Math.max(2,5*inv);
  const ha=items&&items.length>0;
  const cc=items?items.filter(d=>(d.severity||d.risk_level)==='Critical').length:0;

  return(
    <div style={{fontFamily:F,background:'#060a12',color:'#c8d6e5',height:'100vh',display:'flex',flexDirection:'column',overflow:'hidden'}}>
      {/* HEADER */}
      <div style={{background:'linear-gradient(90deg,#080e1c,#0d1830)',borderBottom:'1px solid #14243e',padding:'0 16px',height:48,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0,zIndex:30}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:7,height:7,borderRadius:'50%',background:'#22c55e',boxShadow:'0 0 8px #22c55e88'}}/>
          <span style={{fontSize:15,fontWeight:700,color:'#e2e8f0',letterSpacing:'-0.01em'}}>SC Hub</span>
          <span style={{fontSize:9,color:'#2d4260',letterSpacing:2.5,textTransform:'uppercase',fontWeight:600,fontFamily:FM}}>DISRUPTION MONITOR</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <div style={{display:'flex',alignItems:'center',gap:6,background:'#0a1220',border:'1px solid #162040',borderRadius:6,padding:'4px 10px',fontFamily:FM,fontSize:10}}>
            <span style={{color:'#60a5fa',fontWeight:700}}>{vis.length}</span><span style={{color:'#2a3d5c'}}>sites</span>
            <span style={{color:'#1e3050'}}>{'\u00b7'}</span>
            <span style={{color:'#94a3b8',fontWeight:600}}>{nC}</span><span style={{color:'#2a3d5c'}}>countries</span>
            {sSup&&<span style={{display:'contents'}}><span style={{color:'#1e3050'}}>{'\u00b7'}</span><span style={{color:'#a78bfa',fontWeight:600}}>5,090</span><span style={{color:'#2a3d5c'}}>suppliers</span></span>}
          </div>
          {!loading&&sTime&&<div style={{display:'flex',alignItems:'center',gap:5,background:'#0a1220',border:'1px solid #162040',borderRadius:6,padding:'4px 10px',fontFamily:FM,fontSize:9}}>
            <span style={{color:'#2a3d5c'}}>Last scan</span>
            <span style={{color:'#64748b',fontWeight:600}}>{relTime(sTime)}</span>
          </div>}
          <button onClick={()=>setFO(!fO)} style={{padding:'5px 10px',border:`1px solid ${fO?'#2563eb44':'#1a2744'}`,borderRadius:6,fontSize:10,cursor:'pointer',background:fO?'#1e3a5f18':'transparent',color:fO?'#60a5fa':'#4a6080',fontWeight:600}}>{'\u2630'} Filters</button>
          <button onClick={()=>scan('disruptions')} disabled={loading} style={{padding:'6px 14px',border:'none',borderRadius:6,fontWeight:600,fontSize:11,cursor:loading?'wait':'pointer',background:ha?'linear-gradient(135deg,#dc2626,#991b1b)':'linear-gradient(135deg,#374151,#1f2937)',color:'#fff',opacity:loading&&mode==='disruptions'?0.8:1,fontFamily:FM}}>{loading&&mode==='disruptions'?'Scanning '+scanPct+'%':'\ud83d\udd34 Scan Disruptions'}</button>
          <button onClick={()=>scan('geopolitical')} disabled={loading} style={{padding:'6px 14px',border:'none',borderRadius:6,fontWeight:600,fontSize:11,cursor:loading?'wait':'pointer',background:'linear-gradient(135deg,#1a6fa3,#003057)',color:'#fff',opacity:loading&&mode==='geopolitical'?0.8:1,fontFamily:FM}}>{loading&&mode==='geopolitical'?'Analysing '+scanPct+'%':'\ud83c\udf0d Geopolitical Brief'}</button>
          <button onClick={()=>scan('trade')} disabled={loading} style={{padding:'6px 14px',border:'none',borderRadius:6,fontWeight:600,fontSize:11,cursor:loading?'wait':'pointer',background:'linear-gradient(135deg,#a16207,#713f12)',color:'#fff',opacity:loading&&mode==='trade'?0.8:1,fontFamily:FM}}>{loading&&mode==='trade'?'Scanning '+scanPct+'%':'\ud83d\udcb0 Trade & Tariffs'}</button>
          {ha&&<button onClick={()=>{if(dOpen)closeD();else{setDOpen(true);setDClosing(false)}}} style={{position:'relative',padding:'5px 8px',border:'1px solid #1a2744',borderRadius:6,background:'transparent',cursor:'pointer',color:'#94a3b8',fontSize:14,lineHeight:1}}>
            {'\ud83d\udd14'}<span style={{position:'absolute',top:-3,right:-3,background:'#ef4444',color:'#fff',fontSize:8,fontWeight:700,width:16,height:16,borderRadius:99,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:FM,border:'2px solid #060a12'}}>{items.length}</span>
          </button>}
        </div>
      </div>

      {/* SCAN PROGRESS BAR — non-blocking */}
      {(loading||scanPct>0)&&<div style={{height:2,background:'#0a1220',flexShrink:0,overflow:'hidden',position:'relative',zIndex:29}}>
        <div style={{position:'absolute',top:0,left:0,height:'100%',width:scanPct+'%',background:'#2563eb',transition:'width 0.3s ease-out'}}/>
        <div style={{position:'absolute',top:0,left:0,height:'100%',width:scanPct+'%',background:'linear-gradient(90deg,transparent 60%,#60a5fa,transparent)',animation:'sc-scan-slide 2s ease-in-out infinite alternate',transition:'width 0.3s ease-out'}}/>
      </div>}

      {/* FILTERS */}
      {fO&&<div style={{background:'#080e1c',borderBottom:'1px solid #14243e',padding:'8px 16px',display:'flex',flexWrap:'wrap',gap:10,alignItems:'center',flexShrink:0,zIndex:25,animation:'sfu 200ms ease both'}}>
        <span style={{fontSize:8,color:'#2d4260',fontWeight:700,letterSpacing:2,fontFamily:FM}}>TYPE</span>
        <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>{Object.entries(TYPE_CFG).map(([k,v])=>{const on=tF[k];return <button key={k} onClick={()=>setTF(p=>({...p,[k]:!p[k]}))} style={{padding:'3px 8px',border:`1px solid ${on?v.color+'44':'#14243e'}`,borderRadius:4,background:on?v.color+'18':'transparent',color:on?v.color:'#1e3050',fontSize:10,cursor:'pointer',fontWeight:on?600:400}}>{v.label} <span style={{fontFamily:FM,fontSize:8,opacity:.5}}>{tC[k]||0}</span></button>})}</div>
        <div style={{width:1,height:20,background:'#162040',margin:'0 4px'}}/>
        <span style={{fontSize:8,color:'#2d4260',fontWeight:700,letterSpacing:2,fontFamily:FM}}>REGION</span>
        <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>{Object.entries(REGION_CFG).map(([k,v])=>{const on=rF[k];return <button key={k} onClick={()=>setRF(p=>({...p,[k]:!p[k]}))} style={{padding:'3px 8px',border:`1px solid ${on?v.color+'44':'#14243e'}`,borderRadius:4,background:on?v.color+'18':'transparent',color:on?v.color:'#1e3050',fontSize:10,cursor:'pointer',fontWeight:on?600:400}}>{v.label} <span style={{fontFamily:FM,fontSize:8,opacity:.5,marginLeft:4}}>{rC[k]||0}</span></button>})}</div>
        <div style={{width:1,height:20,background:'#162040',margin:'0 4px'}}/>
        <button onClick={()=>setSR(!sR)} style={{padding:'3px 8px',border:`1px solid ${sR?'#1a5f8a44':'#14243e'}`,borderRadius:4,background:sR?'#1a5f8a18':'transparent',color:sR?'#38bdf8':'#1e3050',fontSize:10,cursor:'pointer'}}>Routes</button>
        <button onClick={()=>setSC(!sC)} style={{padding:'3px 8px',border:`1px solid ${sC?'#64748b44':'#14243e'}`,borderRadius:4,background:sC?'#64748b18':'transparent',color:sC?'#94a3b8':'#1e3050',fontSize:10,cursor:'pointer'}}>Chokepoints</button>
        <button onClick={()=>setSSup(!sSup)} style={{padding:'3px 8px',border:`1px solid ${sSup?'#a78bfa44':'#14243e'}`,borderRadius:4,background:sSup?'#a78bfa18':'transparent',color:sSup?'#a78bfa':'#1e3050',fontSize:10,cursor:'pointer'}}>Suppliers <span style={{fontFamily:FM,fontSize:8,opacity:0.5}}>5,090</span></button>
        <div style={{width:1,height:20,background:'#162040',margin:'0 4px'}}/>
        <span style={{fontSize:8,color:'#2d4260',fontWeight:700,letterSpacing:2,fontFamily:FM}}>DIVISION</span>
        <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>{Object.entries(BU_CFG).map(([k,v])=>{const on=buF[k];const cnt=SITES.filter(s=>s.bu===k).length;return <button key={k} onClick={()=>setBuF(p=>({...p,[k]:!p[k]}))} style={{padding:'3px 8px',border:`1px solid ${on?v.color+'44':'#14243e'}`,borderRadius:4,background:on?v.color+'18':'transparent',color:on?v.color:'#1e3050',fontSize:10,cursor:'pointer',fontWeight:on?600:400}}>{v.label} <span style={{fontFamily:FM,fontSize:8,opacity:.5}}>{cnt}</span></button>})}</div>
      </div>}

      {/* MAP */}
      <div ref={cR} style={{flex:1,position:'relative',overflow:'hidden',userSelect:'none',WebkitUserSelect:'none'}} onClick={(e)=>{if(!e.target.closest('[data-click]')){setSelSite(null);setSelRt(null);setSelSupC(null);setScView(null)}}}>
        <svg ref={svg} width={dm.w} height={dm.h} style={{display:'block',cursor:'grab',touchAction:'none'}}>
          <rect width={dm.w} height={dm.h} fill="#060a12"/>
          <defs><radialGradient id="bg"><stop offset="0%" stopColor="#0c1322"/><stop offset="100%" stopColor="#060a12"/></radialGradient><filter id="gl"><feGaussianBlur stdDeviation="1.5" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter><filter id="g2"><feGaussianBlur stdDeviation="3" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
          <g ref={gR}>
            <path d={pg({type:"Sphere"})} fill="url(#bg)" stroke="#162040" strokeWidth={.5}/>
            <path d={pg(gr)} fill="none" stroke="#0a1220" strokeWidth={.3}/>
            {land?.features?.map((f,i)=> {
              const isConflict = CONFLICT_ZONES.has(String(f.id));
              return <path key={i} d={pg(f)} fill={isConflict ? '#1a1520' : '#111c2a'} stroke={isConflict ? '#2a1525' : '#1a2d45'} strokeWidth={.3}/>;
            })}
            {/* Conflict zone red wash overlay */}
            {land?.features?.filter(f => CONFLICT_ZONES.has(String(f.id))).map((f,i) => (
              <path key={'cz'+i} d={pg(f)} fill="#ef4444" fillOpacity={0.08} stroke="#ef4444" strokeWidth={.4} strokeOpacity={0.15}/>
            ))}
            {/* Country labels — subtle */}
            {land?.features?.map((f,i)=>{
              const names={
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
                '36':'Australia','554':'New Zealand','598':'Papua New Guinea'
              };
              // Manual centroid overrides for countries where geoCentroid is wrong (overseas territories etc)
              const overrides={
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
              const n=names[String(f.id)];if(!n)return null;
              const ov=overrides[String(f.id)];
              const p=ov?proj(ov):proj(d3.geoCentroid(f.geometry));if(!p)return null;
              return <text key={'cl'+i} x={p[0]} y={p[1]} textAnchor="middle" fontSize={Math.max(2,5*inv)} fill="#2a4060" fontWeight={600} fontFamily="DM Sans,sans-serif" opacity={0.45} pointerEvents="none">{n}</text>
            })}
            {sR&&arcs.map((d,i)=>{
              const rt=RTS[i];
              const fLvl=corridorFriction[rt.corridor];
              const isSea=rt.type==='sea';
              const isImpacted=impact&&impact.routes.includes(i);
              const fCol=fLvl?FRIC[fLvl]:isSea?'#38bdf8':'#c084fc';
              const fOp=isImpacted?0.7:(fLvl?0.5:isSea?0.25:0.35);
              const fW=isImpacted?Math.max(1,2.5*inv):(fLvl?Math.max(0.6,1.5*inv):isSea?Math.max(0.4,1*inv):Math.max(0.3,0.6*inv));
              const dash=isSea?`${Math.max(2,4*inv)},${Math.max(1.5,3*inv)}`:`${Math.max(0.5,1*inv)},${Math.max(0.5,1*inv)}`;
              return <g key={'r'+i}><path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(6,12*inv)} data-click="1" onClick={(e)=>{const rect=cR.current.getBoundingClientRect();setClickPos({x:e.clientX-rect.left,y:e.clientY-rect.top});setSelRt(selRt===i?null:i);setSelSite(null);setSelSupC(null)}} style={{cursor:'pointer'}}/><path d={d} fill="none" stroke={fCol} strokeWidth={fW} strokeOpacity={fOp} strokeDasharray={dash} pointerEvents="none">
              <animate attributeName="stroke-dashoffset" values={`${Math.max(7,14*inv)};0`} dur={isSea?"4s":"2.5s"} repeatCount="indefinite"/>
            </path></g>})}
            {/* PORT LABELS */}
            {sR&&PORTS.map((p,i)=>{const pp=pt(p.la,p.ln);return pp&&<g key={'pt'+i}>
              <circle cx={pp[0]} cy={pp[1]} r={Math.max(1,2*inv)} fill="#1a5f8a" stroke="#38bdf8" strokeWidth={Math.max(0.2,0.4*inv)} opacity={0.7}/>
              <text x={pp[0]+Math.max(2,3.5*inv)} y={pp[1]+Math.max(0.5,1*inv)} fontSize={Math.max(2.5,6*inv)} fill="#2a6090" fontWeight={600} fontFamily="DM Sans,sans-serif" opacity={0.8}>{p.n}</text>
            </g>})}
            {/* AIRPORT LABELS */}
            {sR&&AIRPORTS.map((a,i)=>{const ap=pt(a.la,a.ln);return ap&&<g key={'ap'+i}>
              <rect x={ap[0]-Math.max(0.5,1*inv)} y={ap[1]-Math.max(0.5,1*inv)} width={Math.max(1,2*inv)} height={Math.max(1,2*inv)} rx={Math.max(0.2,0.3*inv)} fill="#c084fc" opacity={.6}/>
              <text x={ap[0]+Math.max(2,3.5*inv)} y={ap[1]+Math.max(0.5,1*inv)} fontSize={Math.max(2.5,6*inv)} fill="#7c3aed" fontWeight={600} fontFamily="DM Sans,sans-serif" opacity={0.8}>{a.n}</text>
            </g>})}
            {sC&&CPS.map((c,i)=>{const p=pt(c.la,c.ln);return p&&<g key={'c'+i}><polygon points={`${p[0]},${p[1]-cs} ${p[0]+cs*.75},${p[1]} ${p[0]},${p[1]+cs} ${p[0]-cs*.75},${p[1]}`} fill="#1e2d44" stroke="#3a506c" strokeWidth={Math.max(.15,.4*inv)} opacity={.8}/><text x={p[0]} y={p[1]-cs-Math.max(1.5,2.5*inv)} textAnchor="middle" fontSize={Math.max(2.5,7*inv)} fill="#2a4060" fontWeight={500} fontFamily="DM Sans,sans-serif">{c.n}</text></g>})}

            {/* PORT LABELS — shown when Routes toggle is on */}
            {sR&&PORTS.map((port,i)=>{const p=pt(port.la,port.ln);if(!p)return null;
              return <g key={'port'+i}>
                <circle cx={p[0]} cy={p[1]} r={Math.max(1,2*inv)} fill="#38bdf8" opacity={.6}/>
                <text x={p[0]} y={p[1]-Math.max(1.5,3*inv)} textAnchor="middle" fontSize={Math.max(2,5.5*inv)} fill="#38bdf8" fontWeight={600} fontFamily="DM Sans,sans-serif" opacity={.7}>{port.n}</text>
              </g>})}

            {/* SUPPLIER BUBBLES — proportional circles per country */}
            {sSup&&SUPPLIERS.map((s,i)=>{const p=pt(s.lat,s.lng);if(!p)return null;
              const r=Math.max(2,(Math.sqrt(s.n/maxSup)*30))*inv;
              const ih=hSup===i;
              const isAff=impact&&impact.suppliers.includes(s.country);
              return <g key={'sup'+i} onMouseEnter={()=>setHSup(i)} onMouseLeave={()=>setHSup(null)} data-click="1" onClick={(e)=>{const rect=cR.current.getBoundingClientRect();setClickPos({x:e.clientX-rect.left,y:e.clientY-rect.top});setSelSupC(selSupC===i?null:i);setSelSite(null);setSelRt(null);setSupExpand({})}} style={{cursor:'pointer'}}>
                <circle cx={p[0]} cy={p[1]} r={r} fill={isAff?"#ef4444":"#a78bfa"} fillOpacity={isAff?0.2:(ih?0.25:0.12)} stroke={isAff?"#ef4444":"#a78bfa"} strokeWidth={Math.max(0.3,(isAff?1.2:0.8)*inv)} strokeOpacity={isAff?0.6:(ih?0.6:0.3)}/>
                {(ih||isAff)&&<circle cx={p[0]} cy={p[1]} r={r+Math.max(2,4*inv)} fill="none" stroke={isAff?"#ef4444":"#a78bfa"} strokeWidth={Math.max(0.2,0.4*inv)} strokeOpacity={0.3}/>}
              </g>})}

            {/* SITES — hover-only labels */}
            {vis.map((s,i)=>{const p=pt(s.lat,s.lng);if(!p)return null;const c=TYPE_CFG[s.type]||TYPE_CFG.other;const ih=hS===i;const bo=(s.type==='sales'||s.type==='other')?0.5:0.85;const r=(c.shape==='tri'||c.shape==='star'||c.shape==='dia')?mr:sr;const sc=(s.bu&&BU_CFG[s.bu])?BU_CFG[s.bu].color:c.color;
              const exp=s.type==='mfg'?exposureScores[s.name]:null;const expC=exp?SEV[exp.level]||'#64748b':null;
              return <g key={'s'+i} data-click="1" onMouseEnter={()=>setHS(i)} onMouseLeave={()=>setHS(null)} onClick={(e)=>{const rect=cR.current.getBoundingClientRect();setClickPos({x:e.clientX-rect.left,y:e.clientY-rect.top});setSelSite(selSite===i?null:i);setSelRt(null);setSelSupC(null);setScView(selSite===i?null:s.name)}} style={{cursor:'pointer'}}>
                {ih&&<circle cx={p[0]} cy={p[1]} r={r*2.5} fill={sc} opacity={.1}/>}
                {impact&&s.type==='mfg'&&impact.factories.includes(s.name)&&<><circle cx={p[0]} cy={p[1]} r={r*3} fill="none" stroke="#ef4444" strokeWidth={Math.max(.4,1*inv)} opacity={.5} strokeDasharray={`${Math.max(1,2*inv)},${Math.max(.5,1*inv)}`}/><circle cx={p[0]} cy={p[1]} r={r*2} fill="#ef4444" opacity={.08}/></>}
                <SiteShape shape={c.shape} x={p[0]} y={p[1]} r={r} sr={sr} color={sc} ih={ih} bo={impact&&s.type==='mfg'&&impact.factories.includes(s.name)?1:bo} inv={inv}/>
                {exp&&<circle cx={p[0]+r} cy={p[1]-r} r={Math.max(1.5,3*inv)} fill={expC} opacity={.9}/>}
              </g>})}

            {/* SUPPLY CHAIN OVERLAY — lines from supplier countries to selected factory */}
            {scView&&SUPPLY_GRAPH[scView]&&(()=>{const graph=SUPPLY_GRAPH[scView];
              const site=SITES.find(s=>s.name===scView);if(!site)return null;
              const sp=pt(site.lat,site.lng);if(!sp)return null;
              return <g opacity={.6}>
                {graph.sup.map((country,ci)=>{
                  const sup=SUPPLIERS.find(s=>s.country===country);if(!sup)return null;
                  const cp=pt(sup.lat,sup.lng);if(!cp)return null;
                  return <g key={'sc'+ci}>
                    <line x1={cp[0]} y1={cp[1]} x2={sp[0]} y2={sp[1]} stroke="#22c55e" strokeWidth={Math.max(.4,1.2*inv)} strokeDasharray={`${Math.max(2,4*inv)},${Math.max(1,2*inv)}`} opacity={.4}/>
                    <circle cx={cp[0]} cy={cp[1]} r={Math.max(2,4*inv)} fill="#22c55e" opacity={.3}/>
                  </g>})}
                <circle cx={sp[0]} cy={sp[1]} r={Math.max(3,6*inv)} fill="none" stroke="#22c55e" strokeWidth={Math.max(.5,1.5*inv)} opacity={.7}/>
              </g>})()}

            {/* DISRUPTION MARKERS — pulsing rings */}
            {items?.map((d,i)=>{if(!d.lat||!d.lng)return null;const p=pt(d.lat,d.lng);if(!p)return null;
              const sv=d.severity||d.risk_level,co=SEV[sv]||'#eab308',is=sel===i;
              const pc=sv==='Critical'?'spc':sv==='High'?'sph':sv==='Medium'?'spm':'spl';
              const du=sv==='Critical'?'1.5s':sv==='High'?'2.5s':'3.5s';
              const cr=Math.max(2,4.5*inv);
              return <g key={'d'+i} data-click="1" onClick={e=>{e.stopPropagation();setSel(is?null:i);if(!dOpen){setDOpen(true);setDClosing(false)}}} onMouseEnter={()=>setHD(i)} onMouseLeave={()=>setHD(null)} style={{cursor:'pointer'}}>
                <circle cx={p[0]} cy={p[1]} fill="none" stroke={co} strokeWidth={Math.max(.5,1.5*inv)} opacity={.4} style={{animation:`${pc} ${du} ease-in-out infinite`}}/>
                {sv==='Critical'&&<circle cx={p[0]} cy={p[1]} fill="none" stroke={co} strokeWidth={Math.max(.3,.8*inv)} opacity={.2} style={{animation:`${pc} ${du} ease-in-out infinite`,animationDelay:'.75s'}}/>}
                <circle cx={p[0]} cy={p[1]} r={cr} fill={co} stroke={is?'#fff':'#000'} strokeWidth={is?Math.max(1,2*inv):Math.max(.5,inv)} filter="url(#g2)"/>
                {is&&<circle cx={p[0]} cy={p[1]} r={cr*2.2} fill="none" stroke="#fff" strokeWidth={Math.max(.3,.8*inv)} strokeDasharray={`${Math.max(1,3*inv)},${Math.max(1,2*inv)}`} opacity={.5}/>}
              </g>})}
          </g>

          {/* Legend pill */}
          <g transform={`translate(14,${dm.h-138})`}>
            <rect x={0} y={0} width={120} height={132} rx={8} fill="#080e1cdd" stroke="#14243e" strokeWidth={.8}/>
            <polygon points="14,16 18,12 22,16" fill={TYPE_CFG.mfg.color}/><text x={30} y={16} fontSize={9} fill="#4a6080" fontFamily="DM Sans">Manufacturing</text>
            <rect x={14.5} y={24.5} width={6} height={6} rx={1} fill={TYPE_CFG.log.color} transform="rotate(45,17.5,27.5)"/><text x={30} y={30} fontSize={9} fill="#4a6080" fontFamily="DM Sans">Logistics</text>
            <rect x={14} y={38} width={7} height={7} rx={1.5} fill={TYPE_CFG.admin.color}/><text x={30} y={44} fontSize={9} fill="#4a6080" fontFamily="DM Sans">Admin/HQ</text>
            <circle cx={18} cy={56} r={2.5} fill={TYPE_CFG.sales.color}/><text x={30} y={59} fontSize={9} fill="#4a6080" fontFamily="DM Sans">Sales/Other</text>
            <line x1={10} y1={70} x2={26} y2={70} stroke="#38bdf8" strokeWidth={1.2} strokeDasharray="4,3" opacity={.5}/><text x={30} y={73} fontSize={9} fill="#4a6080" fontFamily="DM Sans">Sea Lane</text>
            <line x1={10} y1={84} x2={26} y2={84} stroke="#c084fc" strokeWidth={0.8} strokeDasharray="1.5,1.5" opacity={.6}/><text x={30} y={87} fontSize={9} fill="#4a6080" fontFamily="DM Sans">Air Lane</text>
            <circle cx={18} cy={98} r={3} fill="#ef4444" opacity={.8}/><circle cx={18} cy={98} r={6} fill="none" stroke="#ef4444" strokeWidth={.8} opacity={.3}/><text x={30} y={101} fontSize={9} fill="#4a6080" fontFamily="DM Sans">Disruption</text>
            <circle cx={18} cy={114} r={5} fill="#a78bfa" fillOpacity={.15} stroke="#a78bfa" strokeWidth={.6} strokeOpacity={.4}/><text x={30} y={117} fontSize={9} fill="#4a6080" fontFamily="DM Sans">Suppliers</text>
          </g>
          <text x={dm.w-14} y={dm.h-10} textAnchor="end" fontSize={8} fill="#14243e" fontFamily="DM Sans">Scroll to zoom {'\u00b7'} Drag to pan</text>
        </svg>

        {/* SITE TOOLTIP */}
        {hS!==null&&selSite===null&&selRt===null&&selSupC===null&&(()=>{const s=vis[hS];if(!s)return null;const p=pt(s.lat,s.lng);if(!p)return null;const c=TYPE_CFG[s.type]||TYPE_CFG.other;const bc=s.bu&&BU_CFG[s.bu];
          const tx=Math.min(p[0]*zR.current.k+zR.current.x+14,dm.w-200),ty=Math.max(p[1]*zR.current.k+zR.current.y-44,8);
          return <div style={{position:'absolute',left:tx,top:ty,pointerEvents:'none',zIndex:18,background:'#0b1525ee',border:'1px solid #1e3050',borderRadius:8,padding:'8px 12px',boxShadow:'0 8px 32px rgba(0,0,0,.6)',backdropFilter:'blur(12px)',maxWidth:220}}>
            <div style={{fontSize:11,fontWeight:700,color:'#e2e8f0'}}>{s.name}</div>
            <div style={{fontSize:10,color:'#4a6080',marginTop:1}}>{s.country}</div>
            <div style={{display:'flex',gap:4,marginTop:5,flexWrap:'wrap'}}>
              <span style={{background:(bc?bc.color:c.color)+'22',color:bc?bc.color:c.color,padding:'1px 6px',borderRadius:4,fontSize:8,fontWeight:600,border:`1px solid ${bc?bc.color:c.color}33`}}>{bc?bc.label:c.label}</span>
              <span style={{background:(REGION_CFG[s.region]?.color||'#666')+'22',color:REGION_CFG[s.region]?.color,padding:'1px 6px',borderRadius:4,fontSize:8,fontWeight:600}}>{REGION_CFG[s.region]?.label}</span>
            </div></div>})()}

        {/* DISRUPTION TOOLTIP */}
        {hD!==null&&sel!==hD&&items&&selSite===null&&selRt===null&&selSupC===null&&(()=>{const d=items[hD];if(!d?.lat||!d?.lng)return null;const p=pt(d.lat,d.lng);if(!p)return null;
          const sv=d.severity||d.risk_level,co=SEV[sv]||'#eab308';
          const tx=Math.min(p[0]*zR.current.k+zR.current.x+14,dm.w-260),ty=Math.max(p[1]*zR.current.k+zR.current.y-56,8);
          return <div style={{position:'absolute',left:tx,top:ty,pointerEvents:'none',zIndex:18,background:'#0b1525f0',border:`1px solid ${co}44`,borderRadius:8,padding:'10px 14px',boxShadow:`0 8px 32px rgba(0,0,0,.6)`,backdropFilter:'blur(12px)',maxWidth:260}}>
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
              {mode!=='geopolitical'&&<span style={{fontSize:12}}>{CAT[d.category]||'\u26A0\uFE0F'}</span>}
              <span style={{fontSize:12,fontWeight:700,color:'#e2e8f0',lineHeight:1.2}}>{d.event||d.risk}</span>
            </div>
            <div style={{display:'flex',gap:4}}>
              <span style={{background:SBG[sv]||'#333',color:co,padding:'2px 8px',borderRadius:4,fontSize:9,fontWeight:700,fontFamily:FM}}>{sv}</span>
              <span style={{color:'#4a6080',fontSize:9}}>{d.trend||d.trend_arrow}</span>
            </div>
            <div style={{color:'#4a6080',fontSize:9,marginTop:4}}>Click to inspect {'\u2192'}</div>
          </div>})()}

        {/* SUPPLIER TOOLTIP */}
        {hSup!==null&&sSup&&selSite===null&&selRt===null&&selSupC===null&&(()=>{
          const s=SUPPLIERS[hSup];if(!s)return null;const p=pt(s.lat,s.lng);if(!p)return null;
          const tx=Math.min(p[0]*zR.current.k+zR.current.x+14,dm.w-240);
          const ty=Math.max(p[1]*zR.current.k+zR.current.y-56,8);
          return <div style={{position:'absolute',left:tx,top:ty,pointerEvents:'none',zIndex:18,background:'#0b1525f0',border:'1px solid #a78bfa33',borderRadius:8,padding:'10px 14px',boxShadow:'0 8px 32px rgba(0,0,0,.6)',maxWidth:240}}>
            <div style={{fontSize:12,fontWeight:700,color:'#e2e8f0'}}>{s.country}</div>
            <div style={{display:'flex',gap:8,marginTop:6,fontFamily:FM,fontSize:10}}>
              <div><span style={{color:'#a78bfa',fontWeight:700}}>{s.n.toLocaleString()}</span><span style={{color:'#4a6080',marginLeft:3}}>suppliers</span></div>
              <div><span style={{color:'#94a3b8',fontWeight:600}}>{s.rows.toLocaleString()}</span><span style={{color:'#4a6080',marginLeft:3}}>relationships</span></div>
            </div>
            <div style={{display:'flex',gap:3,flexWrap:'wrap',marginTop:6}}>
              {s.cats.map((c,i)=> <span key={i} style={{background:'#a78bfa15',color:'#a78bfa',padding:'1px 6px',borderRadius:3,fontSize:8,fontWeight:500,border:'1px solid #a78bfa22'}}>{c}</span>)}
            </div>
          </div>
        })()}

        {/* CLICK POPUPS */}
        {selSite!==null&&(()=>{const s=vis[selSite];if(!s)return null;const bc=s.bu&&BU_CFG[s.bu];const c=TYPE_CFG[s.type]||TYPE_CFG.other;
          const tx=Math.min(clickPos.x+12,dm.w-310),ty=Math.max(clickPos.y-20,8);
          const ad=ADDR[s.name];const adCity=ad?ad.split('|')[0]:'';const adAddr=ad?ad.split('|')[1]:'';
          const graph=SUPPLY_GRAPH[s.name];const exp=exposureScores[s.name];
          return <div data-click="1" style={{position:'absolute',left:tx,top:ty,zIndex:22,background:'#080e1cf0',border:'1px solid #1e3a5c',borderRadius:10,padding:'14px 16px',boxShadow:'0 12px 40px rgba(0,0,0,.7)',backdropFilter:'blur(16px)',width:290,maxHeight:440,overflow:'auto'}} className="sc-s">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:'#e2e8f0'}}>{s.name}</div>
                <div style={{fontSize:10,color:'#64748b',marginTop:2}}>{s.country} {'\u00b7'} {REGION_CFG[s.region]?.label}</div>
              </div>
              <button onClick={()=>{setSelSite(null);setScView(null)}} style={{background:'none',border:'none',color:'#4a6080',cursor:'pointer',fontSize:14,padding:0}}>{'\u2715'}</button>
            </div>
            <div style={{display:'flex',gap:4,marginTop:8,flexWrap:'wrap'}}>
              {bc&&<span style={{background:bc.color+'22',color:bc.color,padding:'2px 8px',borderRadius:4,fontSize:9,fontWeight:600,border:`1px solid ${bc.color}33`}}>{bc.label}</span>}
              <span style={{background:c.color+'22',color:c.color,padding:'2px 8px',borderRadius:4,fontSize:9,fontWeight:600,border:`1px solid ${c.color}33`}}>{c.label}</span>
              {exp&&<span style={{background:(SEV[exp.level]||'#64748b')+'22',color:SEV[exp.level],padding:'2px 8px',borderRadius:4,fontSize:9,fontWeight:700,fontFamily:FM,border:`1px solid ${SEV[exp.level]}33`}}>Exposure: {exp.level} ({exp.score})</span>}
            </div>
            <div style={{marginTop:10,fontFamily:FM,fontSize:10,lineHeight:1.7}}>
              <div style={{display:'flex'}}><span style={{color:'#2a3d5c',width:60,flexShrink:0}}>Country</span><span style={{color:'#94a3b8'}}>{s.country}</span></div>
              {adCity&&<div style={{display:'flex'}}><span style={{color:'#2a3d5c',width:60,flexShrink:0}}>City</span><span style={{color:'#94a3b8'}}>{adCity}</span></div>}
              {adAddr&&<div style={{display:'flex'}}><span style={{color:'#2a3d5c',width:60,flexShrink:0}}>Address</span><span style={{color:'#94a3b8',fontSize:9}}>{adAddr}</span></div>}
            </div>
            {/* SUPPLY CHAIN VIEW */}
            {graph&&<div style={{marginTop:10,paddingTop:10,borderTop:'1px solid #14243e'}}>
              <div style={{fontSize:8,fontWeight:700,textTransform:'uppercase',letterSpacing:1.5,color:'#22c55e',fontFamily:FM,marginBottom:6}}>Inbound Supply Chain</div>
              <div style={{fontSize:9,color:'#2a3d5c',marginBottom:6}}>Key inputs: {graph.inputs.join(', ')}</div>
              <div style={{fontSize:8,fontWeight:600,color:'#2a3d5c',fontFamily:FM,marginBottom:4}}>Supplier Countries</div>
              {graph.sup.map((country,ci)=>{const supData=SUPPLIERS.find(x=>x.country===country);
                return <div key={ci} style={{display:'flex',alignItems:'center',gap:6,padding:'3px 0',borderBottom:'1px solid #0d1525'}}>
                  <div style={{width:4,height:4,borderRadius:2,background:'#22c55e',flexShrink:0}}/>
                  <span style={{fontSize:10,color:'#94a3b8',flex:1}}>{country}</span>
                  {supData&&<span style={{fontFamily:FM,fontSize:8,color:'#2a3d5c'}}>{supData.n} sup</span>}
                </div>})}
              {/* Serving routes */}
              {(()=>{const srvRoutes=RTS.map((r,i)=>r.origin===s.name?{...r,idx:i}:null).filter(Boolean);
                if(!srvRoutes.length)return null;
                return <div style={{marginTop:6}}>
                  <div style={{fontSize:8,fontWeight:600,color:'#2a3d5c',fontFamily:FM,marginBottom:4}}>Outbound Routes</div>
                  {srvRoutes.map((r,ri)=><div key={ri} style={{fontSize:9,color:'#64748b',padding:'2px 0'}}>
                    <span style={{color:r.type==='sea'?'#38bdf8':'#c084fc'}}>{r.type==='sea'?'\u{1F6A2}':'\u2708\uFE0F'}</span> {r.label} <span style={{color:'#2a3d5c'}}>({r.corridor})</span>
                  </div>)}
                </div>})()}
            </div>}
            {/* EXPOSURE THREATS */}
            {exp&&exp.threats.length>0&&<div style={{marginTop:8,paddingTop:8,borderTop:'1px solid #14243e'}}>
              <div style={{fontSize:8,fontWeight:700,textTransform:'uppercase',letterSpacing:1.5,color:SEV[exp.level],fontFamily:FM,marginBottom:4}}>Active Threats ({exp.threats.length})</div>
              {exp.threats.slice(0,5).map((t,ti)=><div key={ti} style={{display:'flex',alignItems:'center',gap:4,padding:'3px 0',borderBottom:'1px solid #0d1525'}}>
                <div style={{width:6,height:6,borderRadius:3,background:SEV[t.severity],flexShrink:0}}/>
                <span style={{fontSize:9,color:'#94a3b8',flex:1}}>{t.event}</span>
                <span style={{fontSize:7,color:'#2a3d5c',fontFamily:FM}}>{t.direct?'DIRECT':t.route?'ROUTE':'SUPPLIER'}</span>
              </div>)}
            </div>}
            {!graph&&s.type==='mfg'&&<div style={{marginTop:10,fontSize:9,color:'#2a3d5c',fontStyle:'italic'}}>Supply chain data not yet mapped for this site</div>}
          </div>})()}

        {selRt!==null&&(()=>{const rt=RTS[selRt];if(!rt)return null;
          const tx=Math.min(clickPos.x+12,dm.w-300),ty=Math.max(clickPos.y-20,8);
          const fLvl=corridorFriction[rt.corridor];
          const fDesc={'Free':'No trade barriers or delays','Low':'Minor documentation requirements','Moderate':'Tariffs or inspections causing delays','High':'Significant tariffs, quotas, or sanctions impacting cost and lead time','Prohibitive':'Blocked or near-blocked route due to sanctions or conflict'};
          const tradeEvent=items&&mode==='trade'?items.find(d=>d.corridor===rt.corridor):null;
          return <div data-click="1" style={{position:'absolute',left:tx,top:ty,zIndex:22,background:'#080e1cf0',border:'1px solid #1e3a5c',borderRadius:10,padding:'14px 16px',boxShadow:'0 12px 40px rgba(0,0,0,.7)',backdropFilter:'blur(16px)',width:280}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div style={{fontSize:13,fontWeight:700,color:'#e2e8f0'}}>{rt.label}</div>
              <button onClick={()=>setSelRt(null)} style={{background:'none',border:'none',color:'#4a6080',cursor:'pointer',fontSize:14,padding:0}}>{'\u2715'}</button>
            </div>
            <div style={{display:'flex',gap:4,marginTop:8,flexWrap:'wrap'}}>
              <span style={{background:rt.type==='sea'?'#1a5f8a33':'#7c3aed33',color:rt.type==='sea'?'#38bdf8':'#a78bfa',padding:'2px 8px',borderRadius:4,fontSize:9,fontWeight:600}}>{rt.type==='sea'?'\u{1F6A2} Sea Lane':'\u2708\uFE0F Air Lane'}</span>
              <span style={{background:'#1e3a5c44',color:'#94a3b8',padding:'2px 8px',borderRadius:4,fontSize:9,fontWeight:500}}>{rt.corridor}</span>
              {fLvl&&<span style={{background:FRIC[fLvl]+'22',color:FRIC[fLvl],padding:'2px 8px',borderRadius:4,fontSize:9,fontWeight:600}}>{fLvl} friction</span>}
            </div>
            {fLvl&&<div style={{marginTop:8,padding:'6px 8px',background:FRIC[fLvl]+'0d',border:`1px solid ${FRIC[fLvl]}22`,borderRadius:6,fontSize:9,color:FRIC[fLvl],fontFamily:FM,lineHeight:1.4}}>
              {fDesc[fLvl]}
            </div>}
            <div style={{marginTop:10,fontFamily:FM,fontSize:10,lineHeight:1.7}}>
              <div style={{display:'flex'}}><span style={{color:'#2a3d5c',width:70,flexShrink:0}}>Origin</span><span style={{color:'#94a3b8'}}>{rt.origin}</span></div>
              <div style={{display:'flex'}}><span style={{color:'#2a3d5c',width:70,flexShrink:0}}>Type</span><span style={{color:'#94a3b8'}}>{rt.type==='sea'?'Maritime':'Aviation'}</span></div>
              {rt.pts&&<div style={{display:'flex'}}><span style={{color:'#2a3d5c',width:70,flexShrink:0}}>Via</span><span style={{color:'#94a3b8'}}>{rt.pts.length>15?'Suez Canal':rt.pts.length>10?'Gibraltar':'Atlantic'}</span></div>}
            </div>
            {tradeEvent&&<div style={{marginTop:10,padding:'8px',background:'#0d152588',borderRadius:6,borderLeft:`2px solid ${FRIC[fLvl]||'#64748b'}`}}>
              <div style={{fontSize:9,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:1,marginBottom:4}}>Active Trade Event</div>
              <div style={{fontSize:10,fontWeight:600,color:'#e2e8f0'}}>{tradeEvent.event}</div>
              <div style={{fontSize:9,color:'#64748b',marginTop:4,lineHeight:1.4}}>{tradeEvent.description?.slice(0,150)}{tradeEvent.description?.length>150?'...':''}</div>
            </div>}
          </div>})()}

        {selSupC!==null&&(()=>{const s=SUPPLIERS[selSupC];if(!s)return null;
          const tx=Math.min(clickPos.x+12,dm.w-300),ty=Math.max(clickPos.y-20,8);
          const cats=SUP_CATS[s.country]||[];// [[L1short, count, [[L2name,count],...]], ...]
          const maxN=cats.length?cats[0][1]:1;
          return <div data-click="1" style={{position:'absolute',left:tx,top:ty,zIndex:22,background:'#080e1cf0',border:'1px solid #a78bfa33',borderRadius:10,padding:'14px 16px',boxShadow:'0 12px 40px rgba(0,0,0,.7)',backdropFilter:'blur(16px)',width:300,maxHeight:420,overflow:'auto'}} className="sc-s">
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:'#e2e8f0'}}>{s.country}</div>
                <div style={{fontFamily:FM,fontSize:10,color:'#a78bfa',marginTop:2}}>{s.n.toLocaleString()} suppliers {'\u00b7'} {s.rows.toLocaleString()} supply entries</div>
              </div>
              <button onClick={()=>{setSelSupC(null);setSupExpand({})}} style={{background:'none',border:'none',color:'#4a6080',cursor:'pointer',fontSize:14,padding:0}}>{'\u2715'}</button>
            </div>
            <div style={{marginTop:10}}>
              {cats.map(([l1,n,subs],ci)=>{const l1Full=L1_FULL[l1]||l1;const isExp=supExpand[l1];
                return <div key={l1} style={{marginBottom:2}}>
                  <div onClick={(e)=>{e.stopPropagation();setSupExpand(p=>({...p,[l1]:!p[l1]}))}} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 0',cursor:'pointer',borderBottom:'1px solid #14243e'}}>
                    <span style={{color:'#2a3d5c',fontSize:9,transform:isExp?'rotate(90deg)':'',transition:'transform .15s',flexShrink:0}}>{'\u25B6'}</span>
                    <span style={{fontSize:10,color:'#c4b5fd',fontWeight:600,width:120,flexShrink:0}}>{l1Full}</span>
                    <div style={{flex:1,height:5,background:'#0d1525',borderRadius:2,overflow:'hidden'}}>
                      <div style={{width:`${(n/maxN)*100}%`,height:'100%',background:'#a78bfa',borderRadius:2,opacity:Math.max(.35,1-ci*.15)}}/>
                    </div>
                    <span style={{fontFamily:FM,fontSize:9,color:'#64748b',width:32,textAlign:'right',flexShrink:0}}>{n}</span>
                  </div>
                  {isExp&&subs.length>0&&<div style={{paddingLeft:16,borderLeft:'1px solid #a78bfa22',marginLeft:4}}>
                    {subs.map(([l2name,l2n])=>{const l2Max=subs[0][1];
                      return <div key={l2name} style={{display:'flex',alignItems:'center',gap:6,padding:'3px 0'}}>
                        <span style={{fontSize:9,color:'#64748b',width:120,flexShrink:0}}>{l2name}</span>
                        <div style={{flex:1,height:3,background:'#0d1525',borderRadius:2,overflow:'hidden'}}>
                          <div style={{width:`${(l2n/l2Max)*100}%`,height:'100%',background:'#7c3aed',borderRadius:2,opacity:.6}}/>
                        </div>
                        <span style={{fontFamily:FM,fontSize:8,color:'#4a6080',width:28,textAlign:'right',flexShrink:0}}>{l2n}</span>
                      </div>})}
                  </div>}
                </div>})}
            </div>
            <div style={{marginTop:8,fontSize:9,color:'#2a3d5c',fontStyle:'italic'}}>Click a category to expand subcategories. Data from supplier master.</div>
          </div>})()}

        {/* EMPTY STATE */}
        {!items&&!loading&&!error&&<div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',textAlign:'center',pointerEvents:'none'}}>
          <div style={{fontSize:48,marginBottom:10,opacity:.3}}>{'\ud83d\udef0\ufe0f'}</div>
          <p style={{color:'#1e3050',fontSize:15,fontWeight:600,margin:0}}>Ready to scan</p>
          <p style={{color:'#14243e',fontSize:11,margin:'4px 0 0',fontFamily:FM}}>{SITES.length} sites {'\u00b7'} {nC} countries</p>
        </div>}

        {/* RIGHT DRAWER */}
        {dOpen&&(items||error)&&<div className={dClosing?'sc-dout':'sc-din'} style={{position:'absolute',top:0,right:0,width:460,height:'100%',background:'#080e1cf8',borderLeft:'1px solid #14243e',boxShadow:'-20px 0 60px rgba(0,0,0,.5)',backdropFilter:'blur(20px)',display:'flex',flexDirection:'column',zIndex:20}}>
          <div style={{padding:'14px 18px 12px',borderBottom:'1px solid #14243e',display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexShrink:0}}>
            <div>
              <div style={{fontSize:14,fontWeight:700,color:'#e2e8f0',display:'flex',alignItems:'center',gap:8}}>
                {mode==='disruptions'?'Active Disruptions':mode==='trade'?'Trade & Tariff Brief':'Geopolitical Brief'}
                {items&&<span style={{fontFamily:FM,fontSize:10,fontWeight:600,color:'#4a6080',background:'#0d1525',border:'1px solid #1e3050',borderRadius:4,padding:'2px 6px'}}>{items.length}</span>}
              </div>
              {sTime&&<div style={{fontSize:9,color:'#2a3d5c',fontFamily:FM,marginTop:4}}>Scanned {relTime(sTime)} · {sTime.toLocaleTimeString()} · {sTime.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</div>}
              {cc>0&&<div style={{display:'inline-flex',alignItems:'center',gap:4,marginTop:6,background:'#7f1d1d44',border:'1px solid #ef444433',borderRadius:4,padding:'2px 8px'}}>
                <div style={{width:6,height:6,borderRadius:'50%',background:'#ef4444',boxShadow:'0 0 6px #ef4444'}}/>
                <span style={{fontSize:9,color:'#fca5a5',fontWeight:600,fontFamily:FM}}>{cc} CRITICAL</span>
              </div>}
            </div>
            <button onClick={closeD} style={{background:'#0d1525',border:'1px solid #1e3050',borderRadius:6,color:'#4a6080',padding:'4px 8px',fontSize:10,cursor:'pointer',fontFamily:FM,fontWeight:600}}>{'\u2715'} ESC</button>
          </div>

          {error&&<div style={{margin:'12px 16px',background:'rgba(220,38,38,.08)',border:'1px solid rgba(220,38,38,.2)',borderRadius:8,padding:12,fontSize:11}}>
            <strong style={{color:'#ef4444'}}>Error: </strong><span style={{color:'#fca5a5'}}>{error}</span>
            <button onClick={()=>scan(mode)} style={{display:'block',marginTop:8,padding:'5px 12px',border:'1px solid #ef444444',borderRadius:5,background:'#ef444418',color:'#fca5a5',fontSize:10,fontWeight:600,cursor:'pointer',fontFamily:FM}}>Retry {mode}</button>
          </div>}

          {/* EXECUTIVE BRIEF */}
            {execBrief&&<div style={{margin:'12px 16px',background:'#060a12',border:'1px solid #14243e',borderRadius:8,padding:'14px 16px'}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10}}>
                <span style={{fontSize:12}}>{'\ud83d\udccb'}</span>
                <span style={{fontSize:11,fontWeight:700,color:'#e2e8f0',textTransform:'uppercase',letterSpacing:1,fontFamily:FM}}>Executive Brief</span>
              </div>
              {/* Severity bar */}
              <div style={{display:'flex',gap:2,marginBottom:10,height:6,borderRadius:3,overflow:'hidden'}}>
                {execBrief.sevCounts.Critical>0&&<div style={{flex:execBrief.sevCounts.Critical,background:SEV.Critical,borderRadius:3}}/>}
                {execBrief.sevCounts.High>0&&<div style={{flex:execBrief.sevCounts.High,background:SEV.High,borderRadius:3}}/>}
                {execBrief.sevCounts.Medium>0&&<div style={{flex:execBrief.sevCounts.Medium,background:SEV.Medium,borderRadius:3}}/>}
                {execBrief.sevCounts.Low>0&&<div style={{flex:execBrief.sevCounts.Low,background:SEV.Low,borderRadius:3}}/>}
              </div>
              <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap'}}>
                {Object.entries(execBrief.sevCounts).filter(([,v])=>v>0).map(([k,v])=>
                  <span key={k} style={{fontFamily:FM,fontSize:10,color:SEV[k],fontWeight:700}}>{v} <span style={{fontWeight:400,color:'#4a6080',fontSize:9}}>{k}</span></span>
                )}
                <span style={{fontFamily:FM,fontSize:10,color:'#64748b'}}>{'\u00b7'} {execBrief.total} total</span>
              </div>
              {/* Narrative */}
              <div style={{fontSize:11,lineHeight:1.6,color:'#8899aa',marginBottom:execBrief.escalating.length?10:0}}>
                {execBrief.total} active {mode==='trade'?'trade policy events':mode==='geopolitical'?'geopolitical risks':'disruptions'} detected across {Object.keys(execBrief.regions).length} regions. {execBrief.topRegion?execBrief.topRegion[0]+' is the most affected region with '+execBrief.topRegion[1]+' events impacting '+execBrief.totalSites+' SKF sites.':''} {execBrief.sevCounts.Critical>0?execBrief.sevCounts.Critical+' critical-severity event'+(execBrief.sevCounts.Critical>1?'s':'')+' require'+(execBrief.sevCounts.Critical===1?'s':'')+' immediate attention.':''}
              </div>
              {/* Escalating items */}
              {execBrief.escalating.length>0&&<div style={{marginBottom:10}}>
                <div style={{fontSize:8,fontWeight:700,textTransform:'uppercase',letterSpacing:1.5,color:'#ef444488',fontFamily:FM,marginBottom:4}}>Escalating</div>
                {execBrief.escalating.map((e,i)=> <div key={i} style={{fontSize:10,color:'#fca5a5',display:'flex',alignItems:'center',gap:4,marginBottom:2}}><span style={{color:'#ef4444'}}>{'\u2197'}</span> {e}</div>)}
              </div>}
              {/* Top actions */}
              {execBrief.actions.length>0&&<div>
                <div style={{fontSize:8,fontWeight:700,textTransform:'uppercase',letterSpacing:1.5,color:'#2a3d5c',fontFamily:FM,marginBottom:4}}>Priority Actions</div>
                {execBrief.actions.map((a,i)=> <div key={i} style={{fontSize:10,color:'#64748b',display:'flex',alignItems:'baseline',gap:5,marginBottom:3}}><span style={{color:'#2563eb',fontSize:8,flexShrink:0}}>{i+1}.</span> {a}</div>)}
              </div>}
            </div>}
          {items&&<div style={{display:'flex',alignItems:'center',gap:6,padding:'6px 16px',borderBottom:'1px solid #14243e'}}>
            <span style={{fontSize:8,fontWeight:700,textTransform:'uppercase',letterSpacing:1.5,color:'#2a3d5c',fontFamily:FM}}>Group by</span>
            <div style={{display:'flex',background:'#0a1220',borderRadius:5,border:'1px solid #14243e',overflow:'hidden'}}>
              <button onClick={()=>setGroupBy('severity')} style={{padding:'3px 10px',fontSize:9,fontWeight:600,fontFamily:FM,border:'none',cursor:'pointer',background:groupBy==='severity'?'#1e3050':'transparent',color:groupBy==='severity'?'#e2e8f0':'#4a6080',transition:'all .15s'}}>Severity</button>
              <button onClick={()=>setGroupBy('region')} style={{padding:'3px 10px',fontSize:9,fontWeight:600,fontFamily:FM,border:'none',cursor:'pointer',background:groupBy==='region'?'#1e3050':'transparent',color:groupBy==='region'?'#e2e8f0':'#4a6080',transition:'all .15s'}}>Region</button>
            </div>
          </div>}

          {/* ASSIGNEE FILTER BAR */}
          {items&&<div style={{padding:'6px 16px',display:'flex',gap:4,flexWrap:'wrap',alignItems:'center',borderBottom:'1px solid #14243e'}}>
            <span style={{fontSize:8,fontWeight:700,letterSpacing:1.5,color:'#2a3d5c',fontFamily:FM}}>FILTER</span>
            <button onClick={()=>setAssignFilter(null)} style={{background:!assignFilter?'#1e3a5c':'transparent',color:!assignFilter?'#60a5fa':'#2a3d5c',border:`1px solid ${!assignFilter?'#2563eb44':'#14243e'}`,borderRadius:4,padding:'2px 8px',fontSize:9,cursor:'pointer',fontWeight:!assignFilter?600:400}}>All</button>
            <button onClick={()=>setAssignFilter('jh')} style={{background:assignFilter==='jh'?'#1e3a5c':'transparent',color:assignFilter==='jh'?'#60a5fa':'#2a3d5c',border:`1px solid ${assignFilter==='jh'?'#2563eb44':'#14243e'}`,borderRadius:4,padding:'2px 8px',fontSize:9,cursor:'pointer',fontWeight:assignFilter==='jh'?600:400}}>My items</button>
            <button onClick={()=>setAssignFilter('unassigned')} style={{background:assignFilter==='unassigned'?'#1e3a5c':'transparent',color:assignFilter==='unassigned'?'#eab308':'#2a3d5c',border:`1px solid ${assignFilter==='unassigned'?'#eab30844':'#14243e'}`,borderRadius:4,padding:'2px 8px',fontSize:9,cursor:'pointer',fontWeight:assignFilter==='unassigned'?600:400}}>Unassigned</button>
            {TEAM.filter(t=>t.id!=='jh').slice(0,4).map(t=><button key={t.id} onClick={()=>setAssignFilter(assignFilter===t.id?null:t.id)} style={{background:assignFilter===t.id?t.color+'22':'transparent',color:assignFilter===t.id?t.color:'#2a3d5c',border:`1px solid ${assignFilter===t.id?t.color+'44':'#14243e'}`,borderRadius:4,padding:'2px 8px',fontSize:9,cursor:'pointer'}}>{t.initials}</button>)}
          </div>}

          {items&&<div className="sc-s" style={{flex:1,overflow:'auto',padding:'4px 0'}}>
            {Object.entries(grouped).map(([grp,ri_items],ri)=>{const isSev=groupBy==='severity';const hdrColor=isSev?(SEV[grp]||'#64748b'):(RMC[grp]||'#64748b');
            return <div key={grp} style={{padding:'8px 16px 0'}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8,padding:'6px 0 4px'}}>
                <div style={{width:3,height:16,borderRadius:2,background:hdrColor}}/>
                <span style={{fontSize:10,fontWeight:700,color:hdrColor,textTransform:'uppercase',letterSpacing:1.5,fontFamily:FM}}>{grp}</span>
                <span style={{fontFamily:FM,fontSize:9,color:'#2a3d5c'}}>{ri_items.length}</span>
                <div style={{flex:1,height:1,background:'#14243e'}}/>
                {!isSev&&<span style={{fontFamily:FM,fontSize:8,color:'#1e3050',background:'#0a1220',border:'1px solid #14243e',borderRadius:3,padding:'1px 5px'}}>{rsc[grp]||0} sites</span>}
              </div>

              {ri_items.map((d,ci)=>{const idx=d._i,is=sel===idx,sv=d.severity||d.risk_level,co=SEV[sv]||'#6b7280',ig=mode==='geopolitical',it=mode==='trade';
                const ta=ig?d.trend_arrow:(d.trend==='Escalating'?'\u2197':d.trend==='De-escalating'?'\u2198':d.trend==='New'?'\u26A1':'\u2192');
                const tc=ta==='\u2197'||ta==='\u26A1'?'#ef4444':ta==='\u2198'?'#22c55e':'#64748b';
                const ie=ta==='\u2197'||d.trend==='Escalating';
                const fCol=it&&d.friction_level?FRIC[d.friction_level]||'#64748b':null;
                const rc=RMC[d.region]||'#64748b';
                const eid=eventId(d);const reg=registry[eid]||{};
                const tk=tickets[eid]||{};const cardOwner=tk.owner?TEAM_MAP[tk.owner]:null;const tSt=tk.ticketStatus||'open';const tSc=STATUS_CFG[tSt];
                return <div key={idx} className="sc-ce" onClick={()=>setSel(is?null:idx)}
                  style={{background:reg._reEmerged?'#1a0808':is?'#0d1830':'#0a1220',border:`1px solid ${reg._reEmerged?'#ef444444':is?co+'44':'#14243e'}`,borderRadius:8,padding:'10px 12px',cursor:'pointer',transition:'all .18s',marginBottom:6,animationDelay:`${ri*60+ci*40}ms`,boxShadow:is?`0 0 20px ${co}11`:''} }>
                  <div style={{display:'flex',alignItems:'flex-start',gap:8}}>
                    <div style={{flex:1}}>
                      <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:5}}>
                        <span style={{fontSize:12}}>{CAT[d.category]||'\u26A0\uFE0F'}</span>
                        <span style={{fontSize:12,fontWeight:700,color:'#e2e8f0',lineHeight:1.3}}>{d.event||d.risk}</span>
                      </div>
                      <div style={{display:'flex',gap:4,flexWrap:'wrap',alignItems:'center'}}>
                        {isSev?<span style={{background:'#1e293b',color:'#4a6080',padding:'2px 8px',borderRadius:4,fontSize:9,fontWeight:500,fontFamily:FM,border:'1px solid #1e3050'}}>{d.region||'Global'}</span>
                        :<span style={{background:SBG[sv]||'#333',color:co,padding:'2px 8px',borderRadius:4,fontSize:9,fontWeight:700,fontFamily:FM,border:`1px solid ${co}33`}}>{sv}</span>}
                        <span className={ie?'sc-sh':''} style={{background:ie?'#7f1d1d44':'#0d1525',color:tc,padding:'2px 8px',borderRadius:4,fontSize:9,fontWeight:600,fontFamily:FM,border:`1px solid ${tc}22`,display:'flex',alignItems:'center',gap:3}}><span style={{fontSize:13,lineHeight:1}}>{ta}</span>{d.trend}</span>
                        {it&&d.corridor&&<span style={{background:'#1e293b',color:'#94a3b8',padding:'2px 8px',borderRadius:4,fontSize:9,fontWeight:600,fontFamily:FM}}>{d.corridor}</span>}
                        {fCol&&<span style={{background:fCol+'22',color:fCol,padding:'2px 8px',borderRadius:4,fontSize:9,fontWeight:700,fontFamily:FM,border:`1px solid ${fCol}33`}}>{d.friction_level}</span>}
                        {reg._new&&<span style={{background:'#2563eb33',color:'#60a5fa',padding:'2px 6px',borderRadius:4,fontSize:8,fontWeight:700,fontFamily:FM}}>NEW</span>}
                        {reg._reEmerged&&<span style={{background:'#ef444433',color:'#fca5a5',padding:'2px 6px',borderRadius:4,fontSize:8,fontWeight:700,fontFamily:FM}}>{'\u26A0'} Re-emerged (was {reg._reEmergedFrom})</span>}
                        {reg.status==='watching'&&<span style={{background:'#2563eb22',color:'#60a5fa',padding:'2px 6px',borderRadius:4,fontSize:8,fontWeight:600,fontFamily:FM}}>{'\ud83d\udd0d'} Watching</span>}
                        {reg.scanCount>1&&!reg._new&&<span style={{fontFamily:FM,fontSize:8,color:'#2a3d5c'}}>Scan #{reg.scanCount}</span>}
                      </div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:4,flexShrink:0}}>
                      {cardOwner&&<div style={{width:18,height:18,borderRadius:9,background:cardOwner.color+'33',border:`1px solid ${cardOwner.color}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:7,fontWeight:700,color:cardOwner.color}} title={cardOwner.name}>{cardOwner.initials}</div>}
                      {tSt!=='open'&&<span style={{fontSize:9,color:tSc.color}} title={tSc.label}>{tSc.icon}</span>}
                      <span style={{color:'#2a3d5c',fontSize:12,transform:is?'rotate(180deg)':'',transition:'transform .2s'}}>{'\u25BE'}</span>
                    </div>
                  </div>
                  {is&&<div style={{marginTop:10,fontSize:11,lineHeight:1.6}}>
                    {!ig&&d.description&&<p style={{color:'#8899aa',margin:'0 0 10px',lineHeight:1.5}}>{d.description}</p>}
                    {/* IMPACT CHAIN — visual flow */}
                    {is&&(()=>{const imp=computeImpact(d,RTS);if(!imp.factories.length&&!imp.routes.length)return null;
                      return <div style={{background:'#060a12',borderRadius:6,padding:'10px',marginBottom:8,border:'1px solid #14243e'}}>
                        <div style={{fontSize:8,fontWeight:700,textTransform:'uppercase',letterSpacing:1.5,color:'#ef444488',fontFamily:FM,marginBottom:8}}>Impact Chain</div>
                        {/* Flow: Disruption → Routes → Factories → Suppliers */}
                        <div style={{display:'flex',flexDirection:'column',gap:6}}>
                          {/* Disruption source */}
                          <div style={{display:'flex',alignItems:'center',gap:6}}>
                            <div style={{width:8,height:8,borderRadius:4,background:SEV[d.severity||d.risk_level],flexShrink:0}}/>
                            <span style={{fontSize:10,color:'#fca5a5',fontWeight:600}}>{d.region}</span>
                          </div>
                          <div style={{borderLeft:'1px dashed #ef444444',marginLeft:4,paddingLeft:12}}>
                            {/* Affected corridors */}
                            <div style={{fontSize:8,color:'#2a3d5c',fontFamily:FM,marginBottom:3}}>AFFECTED CORRIDORS</div>
                            <div style={{display:'flex',gap:3,flexWrap:'wrap',marginBottom:6}}>
                              {imp.corridors.slice(0,5).map(c=><span key={c} style={{background:'#1e293b',color:'#94a3b8',padding:'1px 6px',borderRadius:3,fontSize:8,fontFamily:FM}}>{c}</span>)}
                            </div>
                            {/* Affected factories */}
                            {imp.factories.length>0&&<>
                              <div style={{fontSize:8,color:'#2a3d5c',fontFamily:FM,marginBottom:3}}>EXPOSED FACTORIES</div>
                              <div style={{display:'flex',gap:3,flexWrap:'wrap',marginBottom:6}}>
                                {imp.factories.map(f=>{const exp=exposureScores[f];const ec=exp?SEV[exp.level]:'#64748b';
                                  return <span key={f} style={{background:ec+'18',color:ec,padding:'1px 6px',borderRadius:3,fontSize:8,fontWeight:600,fontFamily:FM,border:`1px solid ${ec}33`}}>{f}</span>})}
                              </div>
                            </>}
                            {/* Affected suppliers */}
                            {imp.suppliers.length>0&&<>
                              <div style={{fontSize:8,color:'#2a3d5c',fontFamily:FM,marginBottom:3}}>UPSTREAM SUPPLIERS AT RISK</div>
                              <div style={{fontSize:9,color:'#64748b',lineHeight:1.4}}>{imp.suppliers.slice(0,8).join(', ')}{imp.suppliers.length>8?` +${imp.suppliers.length-8} more`:''}</div>
                            </>}
                          </div>
                        </div>
                      </div>})()}
                    {ig&&d.this_week&&<div style={{background:'#060a12',borderRadius:6,padding:'8px 10px',marginBottom:8,border:'1px solid #14243e'}}>
                      <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:4}}><span style={{fontSize:10}}>{'\ud83d\udcc5'}</span><span style={{fontSize:8,fontWeight:700,textTransform:'uppercase',letterSpacing:1.5,color:'#2a3d5c',fontFamily:FM}}>This Week</span></div>
                      <div style={{color:'#b8c8d8',fontSize:11}}>{d.this_week}</div>
                    </div>}
                    {/* SUPPLY CHAIN IMPACT */}
                    {impact&&sel===idx&&<div style={{background:'#0a0812',borderRadius:6,padding:'10px',marginBottom:8,border:'1px solid #ef444422'}}>
                      <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:8}}>
                        <span style={{fontSize:10}}>{'\ud83d\udd17'}</span>
                        <span style={{fontSize:8,fontWeight:700,textTransform:'uppercase',letterSpacing:1.5,color:'#ef4444',fontFamily:FM}}>Supply Chain Impact</span>
                      </div>
                      {/* Impact flow */}
                      <div style={{display:'flex',gap:4,marginBottom:8,flexWrap:'wrap'}}>
                        <div style={{background:'#1a0808',border:'1px solid #ef444433',borderRadius:4,padding:'4px 8px',textAlign:'center'}}>
                          <div style={{fontSize:16,fontWeight:700,color:'#ef4444'}}>{impact.corridors.length}</div>
                          <div style={{fontSize:7,color:'#64748b',fontFamily:FM}}>Corridors</div>
                        </div>
                        <div style={{color:'#2a3d5c',alignSelf:'center',fontSize:12}}>{'\u2192'}</div>
                        <div style={{background:'#0a0d18',border:'1px solid #3b82f633',borderRadius:4,padding:'4px 8px',textAlign:'center'}}>
                          <div style={{fontSize:16,fontWeight:700,color:'#60a5fa'}}>{impact.factories.length}</div>
                          <div style={{fontSize:7,color:'#64748b',fontFamily:FM}}>Factories</div>
                        </div>
                        <div style={{color:'#2a3d5c',alignSelf:'center',fontSize:12}}>{'\u2192'}</div>
                        <div style={{background:'#0d0818',border:'1px solid #a78bfa33',borderRadius:4,padding:'4px 8px',textAlign:'center'}}>
                          <div style={{fontSize:16,fontWeight:700,color:'#a78bfa'}}>{impact.suppliers.length}</div>
                          <div style={{fontSize:7,color:'#64748b',fontFamily:FM}}>Supplier countries</div>
                        </div>
                      </div>
                      {/* Affected factories list */}
                      {impact.factories.length>0&&<div style={{marginBottom:6}}>
                        <div style={{fontSize:8,color:'#2a3d5c',fontFamily:FM,fontWeight:600,marginBottom:3}}>Affected Factories</div>
                        <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
                          {impact.factories.map(f=>{const g=SUPPLY_GRAPH[f];return <span key={f} style={{background:'#3b82f611',color:'#60a5fa',padding:'2px 6px',borderRadius:3,fontSize:8,fontFamily:FM,border:'1px solid #3b82f622'}}>
                            {f}{g&&<span style={{color:'#2a3d5c',marginLeft:3}}>({g.bu})</span>}
                          </span>})}
                        </div>
                      </div>}
                      {/* Affected corridors */}
                      <div style={{marginBottom:6}}>
                        <div style={{fontSize:8,color:'#2a3d5c',fontFamily:FM,fontWeight:600,marginBottom:3}}>Trade Corridors at Risk</div>
                        <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
                          {impact.corridors.map(c=><span key={c} style={{background:'#ef444411',color:'#fca5a5',padding:'2px 6px',borderRadius:3,fontSize:8,fontFamily:FM}}>{c}</span>)}
                        </div>
                      </div>
                      {/* Key supplier dependencies */}
                      {impact.factories.length>0&&<div>
                        <div style={{fontSize:8,color:'#2a3d5c',fontFamily:FM,fontWeight:600,marginBottom:3}}>Key Input Dependencies</div>
                        {impact.factories.slice(0,3).map(f=>{const g=SUPPLY_GRAPH[f];if(!g)return null;
                          return <div key={f} style={{display:'flex',gap:4,alignItems:'baseline',marginBottom:2}}>
                            <span style={{fontSize:9,color:'#60a5fa',fontWeight:600,width:90,flexShrink:0}}>{f.split(',')[0].split('(')[0].trim()}</span>
                            <span style={{fontSize:8,color:'#4a6080'}}>{g.inputs.join(', ')}</span>
                          </div>})}
                        {impact.factories.length>3&&<span style={{fontSize:8,color:'#2a3d5c',fontStyle:'italic'}}>+{impact.factories.length-3} more factories</span>}
                      </div>}
                    </div>}
                    {(()=>{const eidx=items.indexOf(d);const eKey='exp_'+eidx;const ed=edits[eKey]||{};
                    const aiSrc=it?d.skf_cost_impact:ig?d.skf_relevance:d.skf_exposure;
                    const userText=ed.text!==undefined?ed.text:null;
                    const displayText=userText!==null?userText:aiSrc;
                    const stale=ed.originalAI&&ed.originalAI!==aiSrc;
                    const verified=ed.status==='approved'&&!stale;
                    const isEditing=editing===eKey;
                    const label=it?'SKF Cost Impact':ig?'SKF Relevance':'SKF Exposure';
                    return <div style={{background:stale?'#1a1508':verified?'#0a1a12':'#060a12',borderRadius:6,padding:'8px 10px',marginBottom:8,border:`1px solid ${stale?'#854d0e':verified?'#166534':'#14243e'}`}}>
                      <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:6}}>
                        <span style={{fontSize:10}}>{it?'\ud83d\udcb0':'\ud83c\udfed'}</span>
                        <span style={{fontSize:8,fontWeight:700,textTransform:'uppercase',letterSpacing:1.5,color:'#2a3d5c',fontFamily:FM}}>{label}</span>
                        {verified&&<span style={{fontSize:8,color:'#22c55e',fontWeight:600,marginLeft:'auto'}}>{'\u2713'} Verified</span>}
                        {stale&&<span style={{fontSize:8,color:'#eab308',fontWeight:600,marginLeft:'auto'}}>{'\u26A0'} Updated</span>}
                        {!verified&&!stale&&userText===null&&<span style={{fontSize:8,color:'#2a3d5c',fontStyle:'italic',marginLeft:'auto'}}>AI-generated</span>}
                      </div>
                      {stale&&<div onClick={(e)=>e.stopPropagation()} style={{background:'#eab30808',borderRadius:5,padding:'8px',marginBottom:8,border:'1px solid #eab30822'}}>
                        <div style={{fontSize:9,fontWeight:600,color:'#eab308',marginBottom:4}}>New AI assessment available:</div>
                        <div style={{fontSize:10,color:'#a3a08a',lineHeight:1.5,background:'#0a0d05',borderRadius:3,padding:'6px 8px',marginBottom:6,borderLeft:'2px solid #eab308'}}>{aiSrc}</div>
                        <div style={{display:'flex',gap:6}}>
                          <button onClick={(e)=>{e.stopPropagation();setEdits(p=>({...p,[eKey]:{text:aiSrc,originalAI:aiSrc,status:'approved'}}))}} style={{background:'#166534',color:'#4ade80',border:'none',borderRadius:4,padding:'4px 10px',fontSize:9,fontWeight:600,cursor:'pointer'}}>Accept update</button>
                          <button onClick={(e)=>{e.stopPropagation();setEdits(p=>({...p,[eKey]:{...p[eKey],originalAI:aiSrc,status:'approved'}}))}} style={{background:'#1e293b',color:'#94a3b8',border:'1px solid #334155',borderRadius:4,padding:'4px 10px',fontSize:9,fontWeight:600,cursor:'pointer'}}>Keep mine</button>
                        </div>
                      </div>}
                      {isEditing?<div onClick={(e)=>e.stopPropagation()}>
                        <textarea value={displayText} autoFocus onChange={(e)=>setEdits(p=>({...p,[eKey]:{...p[eKey],text:e.target.value,originalAI:p[eKey]?.originalAI||aiSrc}}))} style={{width:'100%',background:'#0a1525',color:'#b8c8d8',fontSize:11,border:'1px solid #2563eb',borderRadius:4,padding:'6px 8px',fontFamily:'inherit',resize:'vertical',minHeight:50,outline:'none',boxSizing:'border-box'}}/>
                        <div style={{display:'flex',gap:6,marginTop:6}}>
                          <button onClick={()=>{setEditing(null);setEdits(p=>({...p,[eKey]:{...p[eKey],originalAI:p[eKey]?.originalAI||aiSrc}}))}} style={{background:'#1d4ed8',color:'#fff',border:'none',borderRadius:4,padding:'4px 12px',fontSize:9,fontWeight:600,cursor:'pointer'}}>Save</button>
                          <button onClick={()=>{setEditing(null);if(!ed.originalAI)setEdits(p=>{const n={...p};delete n[eKey];return n})}} style={{background:'none',color:'#64748b',border:'1px solid #1e3050',borderRadius:4,padding:'4px 10px',fontSize:9,cursor:'pointer'}}>Cancel</button>
                          {displayText&&<button onClick={()=>{setEdits(p=>({...p,[eKey]:{...p[eKey],text:aiSrc,originalAI:aiSrc}}));setEditing(null)}} style={{background:'none',color:'#64748b',border:'none',fontSize:9,cursor:'pointer',marginLeft:'auto'}}>Reset to AI</button>}
                        </div>
                      </div>
                      :<div onClick={(e)=>{e.stopPropagation();setEditing(eKey)}} style={{color:displayText?'#b8c8d8':'#2a3d5c',fontSize:11,cursor:'text',borderRadius:4,padding:'2px 0',lineHeight:1.5}} title="Click to edit">
                        {displayText||<span style={{fontStyle:'italic'}}>Click to add assessment...</span>}
                      </div>}
                      {!isEditing&&displayText&&!stale&&<div onClick={(e)=>e.stopPropagation()} style={{display:'flex',gap:4,marginTop:6}}>
                        {!verified&&<button onClick={()=>setEdits(p=>({...p,[eKey]:{...p[eKey],status:'approved',originalAI:aiSrc}}))} style={{background:'none',color:'#22c55e',border:'1px solid #16653444',borderRadius:4,padding:'2px 8px',fontSize:8,cursor:'pointer',fontWeight:600}}>{'\u2713'} Verify</button>}
                        {verified&&<button onClick={()=>setEdits(p=>({...p,[eKey]:{...p[eKey],status:null}}))} style={{background:'none',color:'#64748b',border:'1px solid #1e3050',borderRadius:4,padding:'2px 8px',fontSize:8,cursor:'pointer'}}>Unverify</button>}
                      </div>}
                    </div>})()}
                    {(()=>{const eidx=items.indexOf(d);const aKey='act_'+eidx;const ed=edits[aKey]||{};
                    const aiSrc=ig?d.watchpoint:d.recommended_action;
                    const userText=ed.text!==undefined?ed.text:null;
                    const displayText=userText!==null?userText:aiSrc;
                    const stale=ed.originalAI&&ed.originalAI!==aiSrc;
                    const verified=ed.status==='approved'&&!stale;
                    const isEditing=editing===aKey;
                    const label=ig?'Watchpoint':'Recommended Action';
                    return <div style={{background:stale?'#1a1508':verified?'#0a1a12':'#060a12',borderRadius:6,padding:'8px 10px',border:`1px solid ${stale?'#854d0e':verified?'#166534':'#14243e'}`}}>
                      <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:6}}>
                        <span style={{fontSize:10}}>{'\u26A1'}</span>
                        <span style={{fontSize:8,fontWeight:700,textTransform:'uppercase',letterSpacing:1.5,color:'#2a3d5c',fontFamily:FM}}>{label}</span>
                        {verified&&<span style={{fontSize:8,color:'#22c55e',fontWeight:600,marginLeft:'auto'}}>{'\u2713'} Verified</span>}
                        {stale&&<span style={{fontSize:8,color:'#eab308',fontWeight:600,marginLeft:'auto'}}>{'\u26A0'} Updated</span>}
                        {!verified&&!stale&&userText===null&&<span style={{fontSize:8,color:'#2a3d5c',fontStyle:'italic',marginLeft:'auto'}}>AI-generated</span>}
                      </div>
                      {stale&&<div onClick={(e)=>e.stopPropagation()} style={{background:'#eab30808',borderRadius:5,padding:'8px',marginBottom:8,border:'1px solid #eab30822'}}>
                        <div style={{fontSize:9,fontWeight:600,color:'#eab308',marginBottom:4}}>New AI assessment available:</div>
                        <div style={{fontSize:10,color:'#a3a08a',lineHeight:1.5,background:'#0a0d05',borderRadius:3,padding:'6px 8px',marginBottom:6,borderLeft:'2px solid #eab308'}}>{aiSrc}</div>
                        <div style={{display:'flex',gap:6}}>
                          <button onClick={(e)=>{e.stopPropagation();setEdits(p=>({...p,[aKey]:{text:aiSrc,originalAI:aiSrc,status:'approved'}}))}} style={{background:'#166534',color:'#4ade80',border:'none',borderRadius:4,padding:'4px 10px',fontSize:9,fontWeight:600,cursor:'pointer'}}>Accept update</button>
                          <button onClick={(e)=>{e.stopPropagation();setEdits(p=>({...p,[aKey]:{...p[aKey],originalAI:aiSrc,status:'approved'}}))}} style={{background:'#1e293b',color:'#94a3b8',border:'1px solid #334155',borderRadius:4,padding:'4px 10px',fontSize:9,fontWeight:600,cursor:'pointer'}}>Keep mine</button>
                        </div>
                      </div>}
                      {isEditing?<div onClick={(e)=>e.stopPropagation()}>
                        <textarea value={displayText} autoFocus onChange={(e)=>setEdits(p=>({...p,[aKey]:{...p[aKey],text:e.target.value,originalAI:p[aKey]?.originalAI||aiSrc}}))} style={{width:'100%',background:'#0a1525',color:'#b8c8d8',fontSize:11,border:'1px solid #2563eb',borderRadius:4,padding:'6px 8px',fontFamily:'inherit',resize:'vertical',minHeight:50,outline:'none',boxSizing:'border-box'}}/>
                        <div style={{display:'flex',gap:6,marginTop:6}}>
                          <button onClick={()=>{setEditing(null);setEdits(p=>({...p,[aKey]:{...p[aKey],originalAI:p[aKey]?.originalAI||aiSrc}}))}} style={{background:'#1d4ed8',color:'#fff',border:'none',borderRadius:4,padding:'4px 12px',fontSize:9,fontWeight:600,cursor:'pointer'}}>Save</button>
                          <button onClick={()=>{setEditing(null);if(!ed.originalAI)setEdits(p=>{const n={...p};delete n[aKey];return n})}} style={{background:'none',color:'#64748b',border:'1px solid #1e3050',borderRadius:4,padding:'4px 10px',fontSize:9,cursor:'pointer'}}>Cancel</button>
                          {displayText&&<button onClick={()=>{setEdits(p=>({...p,[aKey]:{...p[aKey],text:aiSrc,originalAI:aiSrc}}));setEditing(null)}} style={{background:'none',color:'#64748b',border:'none',fontSize:9,cursor:'pointer',marginLeft:'auto'}}>Reset to AI</button>}
                        </div>
                      </div>
                      :<div onClick={(e)=>{e.stopPropagation();setEditing(aKey)}} style={{color:displayText?'#b8c8d8':'#2a3d5c',fontSize:11,cursor:'text',borderRadius:4,padding:'2px 0',lineHeight:1.5}} title="Click to edit">
                        {displayText||<span style={{fontStyle:'italic'}}>Click to add action...</span>}
                      </div>}
                      {!isEditing&&displayText&&!stale&&<div onClick={(e)=>e.stopPropagation()} style={{display:'flex',gap:4,marginTop:6}}>
                        {!verified&&<button onClick={()=>setEdits(p=>({...p,[aKey]:{...p[aKey],status:'approved',originalAI:aiSrc}}))} style={{background:'none',color:'#22c55e',border:'1px solid #16653444',borderRadius:4,padding:'2px 8px',fontSize:8,cursor:'pointer',fontWeight:600}}>{'\u2713'} Verify</button>}
                        {verified&&<button onClick={()=>setEdits(p=>({...p,[aKey]:{...p[aKey],status:null}}))} style={{background:'none',color:'#64748b',border:'1px solid #1e3050',borderRadius:4,padding:'2px 8px',fontSize:8,cursor:'pointer'}}>Unverify</button>}
                      </div>}
                    </div>})()}
                    {/* TICKET MANAGEMENT */}
                    {(()=>{const eid=eventId(d);const tk=tickets[eid]||{};const owner=tk.owner?TEAM_MAP[tk.owner]:null;const acts=tk.actions||[];
                    const tStatus=tk.ticketStatus||'open';const sc=STATUS_CFG[tStatus];
                    return <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid #14243e'}}>
                      {/* Header row: status + owner */}
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                        <div style={{display:'flex',alignItems:'center',gap:6}}>
                          <span style={{fontSize:8,fontWeight:700,textTransform:'uppercase',letterSpacing:1.5,color:'#2a3d5c',fontFamily:FM}}>Ticket</span>
                          {/* Status selector */}
                          <select onClick={(e)=>e.stopPropagation()} value={tStatus} onChange={(e)=>{e.stopPropagation();setTickets(p=>({...p,[eid]:{...p[eid],ticketStatus:e.target.value}}))}} style={{background:'#0a1525',color:sc.color,border:`1px solid ${sc.color}44`,borderRadius:4,padding:'2px 6px',fontSize:9,fontFamily:FM,outline:'none',cursor:'pointer'}}>
                            {Object.entries(STATUS_CFG).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
                          </select>
                        </div>
                        {/* Owner */}
                        <div style={{display:'flex',alignItems:'center',gap:4}}>
                          {owner?<div style={{display:'flex',alignItems:'center',gap:4}}>
                            <div style={{width:20,height:20,borderRadius:10,background:owner.color+'33',border:`1px solid ${owner.color}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700,color:owner.color}}>{owner.initials}</div>
                            <span style={{fontSize:9,color:'#94a3b8'}}>{owner.name.split(' ')[0]}</span>
                            <button onClick={(e)=>{e.stopPropagation();setTickets(p=>({...p,[eid]:{...p[eid],owner:null,ticketStatus:'open'}}))}} style={{background:'none',border:'none',color:'#2a3d5c',cursor:'pointer',fontSize:10,padding:0}}>{'\u2715'}</button>
                          </div>
                          :<button onClick={(e)=>{e.stopPropagation();setShowAssign(showAssign===eid?null:eid)}} style={{background:'#1e293b',color:'#94a3b8',border:'1px solid #334155',borderRadius:4,padding:'3px 8px',fontSize:9,cursor:'pointer'}}>Assign</button>}
                        </div>
                      </div>
                      {/* Assignment dropdown */}
                      {showAssign===eid&&<div onClick={(e)=>e.stopPropagation()} style={{background:'#0a1525',border:'1px solid #1e3a5c',borderRadius:6,padding:'4px',marginBottom:8,maxHeight:180,overflow:'auto'}}>
                        {TEAM.map(t=><div key={t.id} onClick={()=>{setTickets(p=>({...p,[eid]:{...p[eid],owner:t.id,ticketStatus:p[eid]?.ticketStatus==='open'?'assigned':p[eid]?.ticketStatus||'assigned'}}));setShowAssign(null)}} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',borderRadius:4,cursor:'pointer',background:tk.owner===t.id?t.color+'11':'transparent'}} onMouseEnter={(e)=>e.currentTarget.style.background=t.color+'11'} onMouseLeave={(e)=>e.currentTarget.style.background=tk.owner===t.id?t.color+'11':'transparent'}>
                          <div style={{width:24,height:24,borderRadius:12,background:t.color+'33',border:`1.5px solid ${t.color}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,color:t.color,flexShrink:0}}>{t.initials}</div>
                          <div><div style={{fontSize:10,fontWeight:600,color:'#e2e8f0'}}>{t.name}</div><div style={{fontSize:8,color:'#4a6080'}}>{t.role}</div></div>
                        </div>)}
                      </div>}
                      {/* Due date */}
                      <div onClick={(e)=>e.stopPropagation()} style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                        <span style={{fontSize:8,color:'#2a3d5c',fontFamily:FM}}>Due</span>
                        <input type="date" value={tk.due||''} onChange={(e)=>setTickets(p=>({...p,[eid]:{...p[eid],due:e.target.value}}))} style={{background:'#0a1525',color:'#94a3b8',border:'1px solid #14243e',borderRadius:4,padding:'2px 6px',fontSize:9,fontFamily:FM,outline:'none'}}/>
                        {tk.due&&new Date(tk.due)<new Date()&&tStatus!=='done'&&<span style={{fontSize:8,color:'#ef4444',fontWeight:600}}>OVERDUE</span>}
                      </div>
                      {/* Action items */}
                      <div style={{marginBottom:4}}>
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                          <span style={{fontSize:8,fontWeight:700,textTransform:'uppercase',letterSpacing:1.5,color:'#2a3d5c',fontFamily:FM}}>Action Items {acts.length>0&&<span style={{color:'#4a6080',fontWeight:400}}>({acts.filter(a=>a.status==='done').length}/{acts.length})</span>}</span>
                          <button onClick={(e)=>{e.stopPropagation();const newAct={text:'',owner:tk.owner||null,due:'',status:'open',created:new Date().toISOString(),id:Date.now()};setTickets(p=>({...p,[eid]:{...p[eid],actions:[...(p[eid]?.actions||[]),newAct]}}))}} style={{background:'#1e293b',color:'#60a5fa',border:'1px solid #2563eb33',borderRadius:4,padding:'2px 8px',fontSize:8,cursor:'pointer',fontWeight:600}}>+ Add</button>
                        </div>
                        {acts.map((act,ai)=>{const aOwner=act.owner?TEAM_MAP[act.owner]:null;const isDone=act.status==='done';
                          const isOverdue=act.due&&new Date(act.due)<new Date()&&!isDone;
                          return <div key={act.id||ai} onClick={(e)=>e.stopPropagation()} style={{display:'flex',gap:6,padding:'6px 0',borderBottom:'1px solid #0d1525',opacity:isDone?.6:1}}>
                            <button onClick={()=>{const na=[...acts];na[ai]={...na[ai],status:isDone?'open':'done'};setTickets(p=>({...p,[eid]:{...p[eid],actions:na}}))}} style={{background:'none',border:`1.5px solid ${isDone?'#22c55e':'#334155'}`,borderRadius:3,width:16,height:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#22c55e',fontSize:10,flexShrink:0,marginTop:1,padding:0}}>{isDone?'\u2713':''}</button>
                            <div style={{flex:1,minWidth:0}}>
                              {editing==='act_'+eid+'_'+ai?<input autoFocus value={act.text} onChange={(e)=>{const na=[...acts];na[ai]={...na[ai],text:e.target.value};setTickets(p=>({...p,[eid]:{...p[eid],actions:na}}))}} onBlur={()=>setEditing(null)} onKeyDown={(e)=>{if(e.key==='Enter'||e.key==='Escape')setEditing(null)}} style={{width:'100%',background:'#0a1525',color:'#b8c8d8',border:'1px solid #2563eb',borderRadius:3,padding:'2px 6px',fontSize:10,outline:'none',fontFamily:'inherit',boxSizing:'border-box'}}/>
                              :<div onClick={()=>setEditing('act_'+eid+'_'+ai)} style={{fontSize:10,color:act.text?(isDone?'#4a6080':'#b8c8d8'):'#2a3d5c',cursor:'text',textDecoration:isDone?'line-through':'none'}}>
                                {act.text||<span style={{fontStyle:'italic'}}>Describe action...</span>}
                              </div>}
                              <div style={{display:'flex',gap:6,marginTop:3,alignItems:'center'}}>
                                {aOwner?<span style={{fontSize:8,color:aOwner.color}}>{aOwner.initials}</span>
                                :<select value={act.owner||''} onChange={(e)=>{const na=[...acts];na[ai]={...na[ai],owner:e.target.value||null};setTickets(p=>({...p,[eid]:{...p[eid],actions:na}}))}} style={{background:'transparent',color:'#2a3d5c',border:'none',fontSize:8,cursor:'pointer',padding:0,outline:'none'}}>
                                  <option value="">Assign...</option>{TEAM.map(t=><option key={t.id} value={t.id}>{t.initials} — {t.name.split(' ')[0]}</option>)}
                                </select>}
                                <input type="date" value={act.due||''} onChange={(e)=>{const na=[...acts];na[ai]={...na[ai],due:e.target.value};setTickets(p=>({...p,[eid]:{...p[eid],actions:na}}))}} style={{background:'transparent',color:isOverdue?'#ef4444':'#2a3d5c',border:'none',fontSize:8,cursor:'pointer',padding:0,outline:'none',width:80}}/>
                                {isOverdue&&<span style={{fontSize:7,color:'#ef4444',fontWeight:700}}>LATE</span>}
                                <button onClick={()=>{const na=acts.filter((_,j)=>j!==ai);setTickets(p=>({...p,[eid]:{...p[eid],actions:na}}))}} style={{background:'none',border:'none',color:'#2a3d5c',cursor:'pointer',fontSize:9,padding:0,marginLeft:'auto'}}>{'\u2715'}</button>
                              </div>
                            </div>
                          </div>})}
                      </div>
                      {/* Notes */}
                      <div onClick={(e)=>e.stopPropagation()} style={{marginTop:6}}>
                        <span style={{fontSize:8,fontWeight:700,textTransform:'uppercase',letterSpacing:1.5,color:'#2a3d5c',fontFamily:FM}}>Notes</span>
                        {editing==='notes_'+eid?<textarea value={tk.notes||''} autoFocus onChange={(e)=>setTickets(p=>({...p,[eid]:{...p[eid],notes:e.target.value}}))} onBlur={()=>setEditing(null)} style={{width:'100%',background:'#0a1525',color:'#b8c8d8',border:'1px solid #1e3a5c',borderRadius:4,padding:'6px 8px',fontSize:10,fontFamily:'inherit',resize:'vertical',minHeight:36,outline:'none',marginTop:4,boxSizing:'border-box'}}/>
                        :<div onClick={()=>setEditing('notes_'+eid)} style={{fontSize:10,color:tk.notes?'#8899aa':'#2a3d5c',cursor:'text',marginTop:4,fontStyle:tk.notes?'normal':'italic',minHeight:20}}>
                          {tk.notes||'Click to add notes...'}
                        </div>}
                      </div>
                    </div>})()}
                    {/* Event lifecycle buttons */}
                    <div onClick={(e)=>e.stopPropagation()} style={{display:'flex',gap:6,marginTop:10,paddingTop:8,borderTop:'1px solid #14243e'}}>
                      {reg.status!=='watching'&&<button onClick={(e)=>{e.stopPropagation();setRegistry(p=>({...p,[eid]:{...p[eid],status:'watching'}}))}} style={{background:'#1e3b5c',color:'#60a5fa',border:'none',borderRadius:4,padding:'4px 10px',fontSize:9,fontWeight:600,cursor:'pointer'}}>{'\ud83d\udd0d'} Watch</button>}
                      {reg.status==='watching'&&<button onClick={(e)=>{e.stopPropagation();setRegistry(p=>({...p,[eid]:{...p[eid],status:'active'}}))}} style={{background:'#1e293b',color:'#94a3b8',border:'1px solid #334155',borderRadius:4,padding:'4px 10px',fontSize:9,cursor:'pointer'}}>Stop watching</button>}
                      <button onClick={(e)=>{e.stopPropagation();setRegistry(p=>({...p,[eid]:{...p[eid],status:'archived',archivedSev:sv,archivedAt:new Date().toISOString()}}))}} style={{background:'#1e293b',color:'#64748b',border:'1px solid #1e3050',borderRadius:4,padding:'4px 10px',fontSize:9,cursor:'pointer'}}>Archive</button>
                    </div>
                  </div>}
                </div>})}
            </div>})}

            {/* NOT DETECTED — events from previous scans that dropped off */}
            {(()=>{const notDetected=Object.entries(registry).filter(([id,r])=>r._notDetected&&(r.status==='active'||r.status==='watching'));
              if(!notDetected.length||!items)return null;
              return <div style={{padding:'8px 16px 0'}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8,padding:'6px 0 4px'}}>
                  <div style={{width:3,height:16,borderRadius:2,background:'#64748b'}}/>
                  <span style={{fontSize:10,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:1.5,fontFamily:FM}}>Not detected in latest scan</span>
                  <span style={{fontFamily:FM,fontSize:9,color:'#2a3d5c'}}>{notDetected.length}</span>
                  <div style={{flex:1,height:1,background:'#14243e'}}/>
                </div>
                {notDetected.map(([id,r])=>{const[evName,evRegion]=id.split('|');
                  return <div key={id} style={{background:'#0a1220',border:'1px solid #1e293b',borderRadius:8,padding:'10px 12px',marginBottom:6,opacity:.7}}>
                    <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:4}}>
                      <span style={{fontSize:11,fontWeight:600,color:'#94a3b8'}}>{evName}</span>
                    </div>
                    <div style={{display:'flex',gap:4,flexWrap:'wrap',alignItems:'center',marginBottom:6}}>
                      <span style={{background:(RMC[evRegion]||'#64748b')+'22',color:RMC[evRegion]||'#64748b',padding:'2px 6px',borderRadius:4,fontSize:8,fontFamily:FM}}>{evRegion}</span>
                      <span style={{fontSize:8,color:'#2a3d5c',fontFamily:FM}}>Last: {r.lastSev} {'\u00b7'} {r.scanCount} scans</span>
                      {r.status==='watching'&&<span style={{background:'#2563eb22',color:'#60a5fa',padding:'2px 6px',borderRadius:4,fontSize:8,fontWeight:600,fontFamily:FM}}>{'\ud83d\udd0d'} Watching</span>}
                    </div>
                    <div style={{fontSize:9,color:'#eab308',background:'#eab30811',borderRadius:4,padding:'4px 8px',marginBottom:6}}>
                      {r.status==='watching'?'Monitored event not found in this scan — will be specifically targeted in next scan':'This event was not detected in the latest scan. It may have resolved or the AI did not pick it up.'}
                    </div>
                    <div style={{display:'flex',gap:6}}>
                      <button onClick={()=>setRegistry(p=>({...p,[id]:{...p[id],status:'watching',_notDetected:true}}))} style={{background:'#1e3b5c',color:'#60a5fa',border:'none',borderRadius:4,padding:'4px 10px',fontSize:9,fontWeight:600,cursor:'pointer'}}>Keep watching</button>
                      <button onClick={()=>setRegistry(p=>({...p,[id]:{...p[id],status:'archived',archivedSev:r.lastSev,archivedAt:new Date().toISOString(),_notDetected:false}}))} style={{background:'#166534',color:'#4ade80',border:'none',borderRadius:4,padding:'4px 10px',fontSize:9,fontWeight:600,cursor:'pointer'}}>{'\u2713'} Mark resolved</button>
                    </div>
                  </div>})}
              </div>})()}

            {/* ARCHIVED / RESOLVED — collapsible */}
            {(()=>{const archived=Object.entries(registry).filter(([,r])=>r.status==='archived');
              if(!archived.length)return null;
              return <div style={{padding:'8px 16px 0'}}>
                <div onClick={()=>setShowArchived(!showArchived)} style={{display:'flex',alignItems:'center',gap:6,marginBottom:8,padding:'6px 0 4px',cursor:'pointer'}}>
                  <div style={{width:3,height:16,borderRadius:2,background:'#1e3050'}}/>
                  <span style={{fontSize:10,fontWeight:700,color:'#2a3d5c',textTransform:'uppercase',letterSpacing:1.5,fontFamily:FM}}>Resolved / Archived</span>
                  <span style={{fontFamily:FM,fontSize:9,color:'#1e3050'}}>{archived.length}</span>
                  <div style={{flex:1,height:1,background:'#0d1525'}}/>
                  <span style={{color:'#2a3d5c',fontSize:10,transform:showArchived?'rotate(180deg)':'',transition:'transform .2s'}}>{'\u25BE'}</span>
                </div>
                {showArchived&&archived.map(([id,r])=>{const[evName,evRegion]=id.split('|');
                  return <div key={id} style={{background:'#0a1220',border:'1px solid #14243e',borderRadius:8,padding:'8px 12px',marginBottom:4}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                      <div style={{flex:1}}>
                        <span style={{fontSize:10,color:'#64748b'}}>{evName}</span>
                        <div style={{fontSize:8,color:'#2a3d5c',fontFamily:FM,marginTop:2}}>Archived at {r.archivedSev} {r.archivedAt?'\u00b7 '+new Date(r.archivedAt).toLocaleDateString():''}</div>
                      </div>
                      <button onClick={()=>setRegistry(p=>({...p,[id]:{...p[id],status:'active'}}))} style={{background:'#1e293b',color:'#94a3b8',border:'1px solid #334155',borderRadius:4,padding:'4px 10px',fontSize:9,cursor:'pointer',flexShrink:0}}>Reactivate</button>
                    </div>
                  </div>})}
              </div>})()}
            
            <div style={{padding:'12px 16px 20px',fontSize:8,color:'#14243e',fontStyle:'italic',borderTop:'1px solid #0d1525',margin:'8px 16px 0'}}>Prototype — assessments based on AI training knowledge, not live web data. Live scanning enabled on AWS deployment.</div>
          </div>}
        </div>}
      </div>
    </div>
  );
}

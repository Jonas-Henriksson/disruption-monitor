// Global CSS injected once on mount
export const GLOBAL_CSS = `
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
@keyframes sc-pulse-live{0%,100%{box-shadow:0 0 4px #22c55e88;opacity:1}50%{box-shadow:0 0 12px #22c55e;opacity:.7}}
@keyframes sc-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes sc-pulse-dot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.4)}}
.sc-din{animation:sli 280ms cubic-bezier(.16,1,.3,1) both}
.sc-dout{animation:slo 200ms cubic-bezier(.7,0,.84,0) both}
.sc-ce{animation:sfu 300ms cubic-bezier(.16,1,.3,1) both}
.sc-sh{background:linear-gradient(90deg,transparent,rgba(255,255,255,.06),transparent);background-size:200% 100%;animation:shim 2s ease infinite}
.sc-bar{transform-origin:left;animation:scb 45s linear}
.sc-s{scrollbar-width:thin;scrollbar-color:#1e293b transparent}.sc-s::-webkit-scrollbar{width:4px}.sc-s::-webkit-scrollbar-track{background:transparent}.sc-s::-webkit-scrollbar-thumb{background:#1e293b;border-radius:4px}
.sc-live-dot{animation:sc-pulse-dot 2s ease-in-out infinite}
.sc-live-badge{animation:sc-pulse-live 2.5s ease-in-out infinite}
.sc-spin{animation:sc-spin .8s linear infinite}
@keyframes sc-skel{0%{background-position:200% 0}100%{background-position:-200% 0}}
.sc-skel{background:linear-gradient(90deg,#0d1830 25%,#14243e 50%,#0d1830 75%);background-size:200% 100%;animation:sc-skel 1.5s ease infinite;border-radius:6px}
@keyframes sc-timeline-open{from{max-height:40px}to{max-height:200px}}
@keyframes sc-timeline-close{from{max-height:200px}to{max-height:40px}}
.sc-tl-open{animation:sc-timeline-open .3s ease forwards}
.sc-tl-close{animation:sc-timeline-close .3s ease forwards}
@keyframes sc-narrative-in{from{opacity:0;max-height:0}to{opacity:1;max-height:400px}}
.sc-narr-in{animation:sc-narrative-in .4s ease both;overflow:hidden}
@keyframes sc-arc-draw{from{stroke-dashoffset:1000;opacity:0}to{stroke-dashoffset:0;opacity:1}}
.sc-arc{stroke-dasharray:1000;animation:sc-arc-draw 1.2s ease-out forwards}
button:focus-visible,[data-click]:focus-visible,[tabindex]:focus-visible{outline:2px solid #2563eb;outline-offset:2px}
button:focus:not(:focus-visible){outline:none}
.sc-left-panel{transition:width 280ms cubic-bezier(.16,1,.3,1),min-width 280ms cubic-bezier(.16,1,.3,1)}
.sc-right-panel{transition:width 280ms cubic-bezier(.16,1,.3,1),min-width 280ms cubic-bezier(.16,1,.3,1)}
@media(max-width:767px){
  .sc-left-panel,.sc-right-panel{width:100%!important;min-width:0!important;border:none!important}
  .sc-s::-webkit-scrollbar{display:none}
  .sc-s{-ms-overflow-style:none;scrollbar-width:none}
  html{-webkit-text-size-adjust:100%;touch-action:manipulation}
}
@media(min-width:768px) and (max-width:1023px){
  .sc-left-panel{display:none!important}
}
`;

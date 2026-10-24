// Tiny top-down world engine: one <canvas>, a tile grid, y-sorted sprites, bump-to-talk.
// The world is painted once to an offscreen canvas; frames only render while something moves.
(() => {
const TS = 16, STEP = 0.13;               // tile size, seconds per tile
const DIRS = {up:[0,-1], down:[0,1], left:[-1,0], right:[1,0]};
const WALK_DECO = new Set(["flowers", "tuft"]);
const FONT = '8px "Press Start 2P"';
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

// ---------- pixel painters (all take a 2d context) ----------
const rect = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
const blob = (g, cx, cy, r, c) => { g.fillStyle = c; for (let dy = -r; dy <= r; dy++) { const dx = Math.round(Math.sqrt(r*r - dy*dy)); g.fillRect(cx-dx, cy+dy, dx*2+1, 1); } };

const GROUND = {
  grass(g, x, y, c) { rect(g, x, y, TS, TS, c.grass); for (let i = 0; i < 6; i++) rect(g, x + rnd()*15, y + rnd()*15, 1, 1, i % 2 ? c.grassDark : c.grassLight); },
  road(g, x, y) { rect(g, x, y, TS, TS, "#4b4f58"); for (let i = 0; i < 4; i++) rect(g, x + rnd()*15, y + rnd()*15, 1, 1, "#575c66"); },
  sidewalk(g, x, y) { rect(g, x, y, TS, TS, "#cfc8b8"); rect(g, x, y + 15, TS, 1, "#b9b19f"); rect(g, x + 15, y, 1, TS, "#b9b19f"); },
  plaza(g, x, y) { rect(g, x, y, TS, TS, ((x + y) / TS) % 2 ? "#e3d6b8" : "#d9caa8"); rect(g, x, y + 15, TS, 1, "#c7b893"); },
  dirt(g, x, y) { rect(g, x, y, TS, TS, "#c9a26b"); for (let i = 0; i < 5; i++) rect(g, x + rnd()*15, y + rnd()*15, 1, 1, i % 2 ? "#b88f58" : "#d8b47e"); },
  stone(g, x, y) { rect(g, x, y, TS, TS, "#8d8f89"); rect(g, x+1, y+1, 6, 6, "#a7a9a3"); rect(g, x+9, y+1, 6, 6, "#a3a59f"); rect(g, x+1, y+9, 6, 6, "#a3a59f"); rect(g, x+9, y+9, 6, 6, "#a7a9a3"); },
  water(g, x, y) { rect(g, x, y, TS, TS, "#3b8ed6"); rect(g, x + 2 + rnd()*6, y + 3 + rnd()*3, 4, 1, "#7fc0f0"); rect(g, x + 6 + rnd()*6, y + 10 + rnd()*3, 4, 1, "#7fc0f0"); },
  sand(g, x, y) { rect(g, x, y, TS, TS, "#e6d49a"); rect(g, x + rnd()*15, y + rnd()*15, 1, 1, "#d4c083"); },
  bridge(g, x, y) { rect(g, x, y, TS, TS, "#a0703c"); for (let j = 3; j < TS; j += 4) rect(g, x, y + j, TS, 1, "#7a5228"); rect(g, x, y, 1, TS, "#4a3018"); rect(g, x + 15, y, 1, TS, "#4a3018"); },
};

const DECO = {
  tree(g, x, y) { blob(g, x+8, y+13, 5, "#00000030"); rect(g, x+7, y+9, 2, 6, "#6b4a2b"); blob(g, x+8, y+4, 7, "#2e7a34"); blob(g, x+7, y+3, 5, "#3f9a40"); rect(g, x+4, y, 3, 1, "#6cc35a"); },
  cherry(g, x, y) { blob(g, x+8, y+13, 5, "#00000030"); rect(g, x+7, y+9, 2, 6, "#5a3a22"); blob(g, x+8, y+4, 7, "#e889b0"); blob(g, x+7, y+3, 5, "#f4a6c6"); rect(g, x+4, y, 3, 1, "#ffd1e3"); },
  bamboo(g, x, y) { for (const sx of [3, 8, 12]) { rect(g, x+sx, y-6, 2, 21, "#6aa84f"); for (let j = -4; j < 14; j += 5) rect(g, x+sx, y+j, 2, 1, "#3d7a2e"); } rect(g, x+1, y-5, 4, 2, "#8fd16a"); rect(g, x+10, y-2, 4, 2, "#8fd16a"); },
  bush(g, x, y) { blob(g, x+8, y+10, 5, "#2e7a34"); blob(g, x+7, y+9, 3, "#3f9a40"); },
  rock(g, x, y) { blob(g, x+8, y+10, 5, "#7d7f7a"); blob(g, x+7, y+9, 3, "#a3a59f"); },
  flowers(g, x, y) { for (let i = 0; i < 5; i++) rect(g, x + 2 + rnd()*12, y + 2 + rnd()*12, 2, 2, ["#ff5d73","#ffe14d","#ffffff"][i % 3]); },
  tuft(g, x, y) { rect(g, x+6, y+8, 1, 3, "#3f8a30"); rect(g, x+8, y+7, 1, 4, "#3f8a30"); rect(g, x+10, y+9, 1, 2, "#3f8a30"); },
  lamp(g, x, y) { rect(g, x+7, y-6, 2, 20, "#2b2f38"); rect(g, x+5, y-9, 6, 4, "#2b2f38"); rect(g, x+6, y-8, 4, 2, "#ffe680"); rect(g, x+5, y+13, 6, 2, "#2b2f38"); },
  lantern(g, x, y) { rect(g, x+5, y+11, 6, 4, "#7d7f7a"); rect(g, x+7, y+5, 2, 6, "#8d8f89"); rect(g, x+4, y-1, 8, 6, "#8d8f89"); rect(g, x+6, y+1, 4, 3, "#ffcf6b"); rect(g, x+3, y-3, 10, 2, "#5f615c"); },
  bench(g, x, y) { rect(g, x+1, y+6, 14, 3, "#8b5a2b"); rect(g, x+1, y+3, 14, 2, "#a0703c"); rect(g, x+2, y+9, 2, 4, "#4a3018"); rect(g, x+12, y+9, 2, 4, "#4a3018"); },
  barrier(g, x, y) { for (let i = 0; i < 4; i++) rect(g, x + i*4, y+5, 4, 5, i % 2 ? "#ffffff" : "#e4002b"); rect(g, x+1, y+10, 2, 5, "#333"); rect(g, x+13, y+10, 2, 5, "#333"); },
  sign(g, x, y) { rect(g, x+7, y+6, 2, 9, "#4a3018"); rect(g, x+1, y, 14, 9, "#4a3018"); rect(g, x+2, y+1, 12, 7, "#c9a26b"); for (let j = 2; j < 7; j += 2) rect(g, x+4, y+j, 8, 1, "#7a5228"); },
  car(g, x, y) { const c = ["#e4002b","#3d63d6","#f2c14e","#14b894"][Math.floor(rnd()*4)]; rect(g, x-1, y+4, 18, 9, "#1b1b22"); rect(g, x, y+5, 16, 7, c); rect(g, x+3, y+2, 10, 4, "#1b1b22"); rect(g, x+4, y+3, 8, 3, "#9fd3ff"); rect(g, x+1, y+12, 4, 3, "#111"); rect(g, x+11, y+12, 4, 3, "#111"); },
  torii(g, x, y) { rect(g, x+2, y-2, 3, 17, "#c0392b"); rect(g, x+11, y-2, 3, 17, "#c0392b"); rect(g, x-1, y-6, 18, 3, "#1b1b22"); rect(g, x, y-3, 16, 2, "#c0392b"); },
};

// buildings: X,Y,W,H in px; b has label, colors, door [tx,ty]
function plate(g, cx, y, text, bg, fg) {
  g.font = FONT; const w = Math.ceil(g.measureText(text).width);
  rect(g, cx - w/2 - 4, y, w + 8, 12, "#1b1b22"); rect(g, cx - w/2 - 3, y + 1, w + 6, 10, bg);
  g.fillStyle = fg; g.textBaseline = "top"; g.fillText(text, Math.round(cx - w/2), y + 2);
}
function door(g, b, col = "#3a2414") { const dx = b.door[0]*TS, dy = b.door[1]*TS; rect(g, dx+2, dy+1, 12, 15, "#1b1b22"); rect(g, dx+3, dy+2, 10, 14, col); rect(g, dx+10, dy+9, 2, 2, "#ffc83d"); }
function windows(g, x0, y0, x1, y1, glass, step = 10) {
  for (let wy = y0; wy + 6 <= y1; wy += step) for (let wx = x0; wx + 6 <= x1; wx += step) { rect(g, wx, wy, 7, 7, "#1b1b22"); rect(g, wx+1, wy+1, 5, 5, glass); rect(g, wx+1, wy+1, 2, 1, "#ffffffaa"); }
}
function stepRoof(g, X, Y, W, h, c, dark, over = 3) {
  for (let i = 0; i < h; i++) { const inset = Math.max(0, Math.round((h - i) * .55) - 2); rect(g, X - over + inset, Y + i, W + over*2 - inset*2, 1, i % 3 ? c : dark); }
  rect(g, X - over, Y + h - 1, W + over*2, 2, "#1b1b22");
}
const STYLE = {
  office(g, X, Y, W, H, b, c) {
    rect(g, X, Y + 6, W, H - 6, "#1b1b22"); rect(g, X+1, Y + 7, W-2, H-8, c.wall || "#c9ced6");
    rect(g, X-1, Y, W+2, 14, "#1b1b22"); rect(g, X, Y+1, W, 12, c.roof || "#5b6270");
    windows(g, X+5, Y+19, X+W-4, b.door[1]*TS - 2, c.glass || "#8fd0ff");
    door(g, b, c.door || "#2b3a55"); if (b.label) plate(g, X + W/2, Y + 1, b.label, c.roof || "#5b6270", c.text || "#fff");
  },
  house(g, X, Y, W, H, b, c) {
    const rh = Math.round(H * .42);
    rect(g, X, Y + rh - 2, W, H - rh + 2, "#1b1b22"); rect(g, X+1, Y + rh, W-2, H - rh - 1, c.wall || "#f3e7cc");
    stepRoof(g, X, Y, W, rh, c.roof || "#c0392b", c.roofDark || "#922b21");
    windows(g, X+4, Y + rh + 16, X + W - 4, Y + H - 4, c.glass || "#8fd0ff", 12);
    door(g, b, c.door); if (b.label) plate(g, X + W/2, Y + rh + 2, b.label, c.plate || "#1b1b22", "#fff");
    if (c.awning) for (let i = 1; i < W - 1; i += 4) rect(g, X + i, Y + rh, 4, 5, (i / 4 | 0) % 2 ? "#fff" : c.awning);
    if (c.columns) for (let cx = X + 4; cx < X + W - 4; cx += 14) rect(g, cx, Y + rh + 14, 3, H - rh - 16, "#f4f1e8");
    if (c.chimney) { rect(g, X + W - 14, Y - 4, 7, 10, "#1b1b22"); rect(g, X + W - 13, Y - 3, 5, 9, "#7d7f7a"); }
  },
  arcade(g, X, Y, W, H, b) {
    rect(g, X, Y, W, H, "#1b1b22"); rect(g, X+1, Y+1, W-2, H-2, "#2a1840");
    rect(g, X+3, Y+3, W-6, 1, "#ff4fd8"); rect(g, X+3, Y+H-4, W-6, 1, "#ff4fd8"); rect(g, X+5, Y+5, W-10, 1, "#4ff0ff");
    for (let i = 0; i < 4; i++) { const wx = X + 8 + i * ((W - 24) / 3); rect(g, wx, Y + 30, 10, 12, "#111"); rect(g, wx+1, Y + 31, 8, 8, ["#ff4fd8","#4ff0ff","#ffe14d","#7dffb0"][i]); }
    door(g, b, "#4ff0ff"); plate(g, X + W/2, Y + 10, b.label, "#2a1840", "#ffe14d");
  },
  construction(g, X, Y, W, H, b) {
    rect(g, X+2, Y+2, W-4, H-4, "#c9a26b");
    for (let i = 0; i < 4; i++) rect(g, X + 12 + i*16, Y + 10, 2, H - 22, "#8a8f98");
    for (let j = 0; j < 3; j++) rect(g, X + 12, Y + 12 + j*14, 50, 2, "#8a8f98");
    rect(g, X + W - 20, Y - 18, 3, H + 4, "#f2c14e"); rect(g, X + 20, Y - 18, W - 37, 3, "#f2c14e"); rect(g, X + 26, Y - 15, 1, 16, "#333");
    for (let x = 0; x < W; x += 4) { rect(g, X + x, Y, 2, 5, x % 8 ? "#fff" : "#ff8a00"); if (Math.abs(X + x - b.door[0]*TS - 6) > 9) rect(g, X + x, Y + H - 6, 2, 6, x % 8 ? "#fff" : "#ff8a00"); }
    plate(g, X + W/2, Y + H - 28, b.label, "#ffc83d", "#1b1b22");
  },
  subway(g, X, Y, W, H, b) {
    rect(g, X + 4, Y + 16, W - 8, H - 16, "#1b1b22");
    for (let i = 0; i < 5; i++) rect(g, X + 6, Y + 20 + i*7, W - 12, 4, i % 2 ? "#3a3f4b" : "#2b2f38");
    rect(g, X + 3, Y + 14, 2, H - 14, "#1f7a4d"); rect(g, X + W - 5, Y + 14, 2, H - 14, "#1f7a4d");
    rect(g, X + W/2 - 1, Y, 2, 16, "#333"); blob(g, X + W/2, Y + 4, 6, "#e4002b"); blob(g, X + W/2, Y + 4, 3, "#fff");
    rect(g, X + W/2 - 9, Y + 2, 18, 5, "#1b3a8c"); g.font = '5px "Press Start 2P"'; g.fillStyle = "#fff"; g.fillText("M", X + W/2 - 2, Y + 3);
  },
  showroom(g, X, Y, W, H, b, c) {
    rect(g, X, Y, W, H, "#1b1b22"); rect(g, X+1, Y+12, W-2, H-13, "#bfe3ff"); rect(g, X, Y, W, 12, c.roof || "#1c69d4");
    for (let i = 0; i < W; i += 16) rect(g, X + i, Y + 12, 1, H - 12, "#8fb8d8");
    const cx = X + W/2, cy = Y + 34; rect(g, cx-16, cy, 32, 9, "#1b1b22"); rect(g, cx-15, cy+1, 30, 7, "#1c69d4"); rect(g, cx-8, cy-5, 16, 6, "#1b1b22"); rect(g, cx-7, cy-4, 14, 5, "#cfe9ff"); rect(g, cx-12, cy+7, 6, 4, "#111"); rect(g, cx+6, cy+7, 6, 4, "#111");
    door(g, b, "#8fb8d8"); plate(g, X + W/2, Y, b.label, c.roof || "#1c69d4", "#fff");
  },
  wall(g, X, Y, W, H, b) {
    rect(g, X, Y, W, H, "#7a3a2c");
    for (let j = 0; j < H; j += 5) for (let i = (j / 5 % 2) * 4; i < W; i += 8) rect(g, X + i, Y + j, 7, 4, "#9c4a3a");
    const cols = ["#002d72","#a51c30","#4b2e83","#ffcd00","#00843d","#c5050c","#ff8200","#990000","#003262","#ffffff"];
    let k = 0; for (let j = Y + 16; j < Y + H - 18; j += 11) for (let i = X + 5; i < X + W - 12; i += 11) { rect(g, i, j, 9, 9, "#1b1b22"); rect(g, i+1, j+1, 7, 7, cols[k++ % cols.length]); }
    door(g, b, "#4a3018"); plate(g, X + W/2, Y + 2, b.label, "#1b1b22", "#fff");
  },
  dojo(g, X, Y, W, H, b, c) {
    const rh = Math.round(H * .46), wall = c.wall || "#8b5a2b";
    rect(g, X, Y + rh - 2, W, H - rh + 2, "#1b1b22"); rect(g, X+1, Y + rh, W-2, H - rh - 1, wall);
    for (let px = X + 4; px + 8 < X + W - 2; px += 11) rect(g, px, Y + rh + 4, 8, H - rh - 9, "#f4efe2"), rect(g, px + 4, Y + rh + 4, 1, H - rh - 9, "#c9b99a"), rect(g, px, Y + rh + 9, 8, 1, "#c9b99a");
    rect(g, X + 1, Y + rh, 3, H - rh - 1, c.pillar || "#b03a2e"); rect(g, X + W - 4, Y + rh, 3, H - rh - 1, c.pillar || "#b03a2e");
    for (let i = 0; i < rh; i++) { const inset = Math.max(0, Math.round((rh - i) * .7) - 4); rect(g, X - 5 + inset, Y + i, W + 10 - inset*2, 1, i % 3 ? (c.roof || "#3a3f4b") : (c.roofDark || "#2a2e38")); }
    rect(g, X - 8, Y + rh - 4, 4, 3, c.roofDark || "#2a2e38"); rect(g, X + W + 4, Y + rh - 4, 4, 3, c.roofDark || "#2a2e38");
    rect(g, X - 6, Y + rh - 2, W + 12, 2, "#1b1b22");
    if (c.tiers) { const ty = Y - 10; for (let i = 0; i < 10; i++) { const inset = Math.max(0, (10 - i) - 2); rect(g, X + W*.25 + inset, ty + i, W*.5 - inset*2, 1, c.roof || "#3a3f4b"); } }
    door(g, b, c.door || "#3a2414");
    if (b.label) plate(g, X + W/2, Y + rh + 1, b.label, "#3a2414", "#f4d27a");
  },
  falls(g, X, Y, W, H, b, c) {
    const cw = 32, sx = X + W - cw;
    rect(g, sx, Y, cw, H, "#6f6a62"); for (let i = 0; i < 18; i++) rect(g, sx + rnd()*28, Y + rnd()*(H-4), 4, 3, "#86817a");
    rect(g, sx + 9, Y, 14, H - 10, "#7fc0f0"); for (let i = 0; i < 16; i++) rect(g, sx + 10 + rnd()*12, Y + rnd()*(H-14), 1, 5, "#ffffff");
    blob(g, sx + 16, Y + H - 7, 8, "#3b8ed6"); rect(g, sx + 9, Y + H - 9, 14, 2, "#ffffff");
    STYLE.dojo(g, X, Y + 8, W - cw, H - 8, b, c);
  },
  arena(g, X, Y, W, H, b, c) {
    rect(g, X, Y, W, H, "#1b1b22"); rect(g, X+1, Y+1, W-2, H-2, "#9a9690");
    for (let j = 1; j < H; j += 6) for (let i = (j / 6 % 2) * 5; i < W - 2; i += 10) rect(g, X + 1 + i, Y + j, 9, 5, "#a9a59e");
    for (let i = 0; i < 4; i++) { const bx = X + 10 + i * ((W - 30) / 3); rect(g, bx, Y + 14, 8, 22, ["#e4002b","#ff9a1f","#3d63d6","#14b894"][i]); rect(g, bx + 3, Y + 18, 2, 2, "#fff"); }
    rect(g, X - 2, Y, W + 4, 6, "#5f5b55"); for (let i = 0; i < W; i += 8) rect(g, X + i, Y - 4, 5, 4, "#5f5b55");
    door(g, b, "#3a2414"); plate(g, X + W/2, Y + H - 34, b.label, "#3a2414", "#f4d27a");
  },
  watchtower(g, X, Y, W, H, b, c) {
    const cx = X + W/2;
    rect(g, X + 6, Y + 26, 3, H - 26, "#5a3a22"); rect(g, X + W - 9, Y + 26, 3, H - 26, "#5a3a22");
    for (let j = Y + 34; j < Y + H - 18; j += 12) rect(g, X + 6, j, W - 12, 2, "#5a3a22");
    rect(g, X + 2, Y + 8, W - 4, 20, "#1b1b22"); rect(g, X + 3, Y + 9, W - 6, 18, c.wall || "#8b5a2b");
    rect(g, X + 6, Y + 13, W - 12, 8, "#1b1b22"); rect(g, X + 7, Y + 14, W - 14, 6, c.glass || "#ffe680");
    stepRoof(g, X + 2, Y - 2, W - 4, 10, c.roof || "#3a3f4b", "#2a2e38", 4);
    if (c.lens) { blob(g, cx, Y + 17, 4, "#1b1b22"); blob(g, cx, Y + 17, 3, "#9fe8ff"); rect(g, cx - 1, Y + 15, 1, 1, "#fff"); }
    rect(g, X + 3, Y + H - 18, W - 6, 18, "#1b1b22"); rect(g, X + 4, Y + H - 17, W - 8, 17, c.base || "#a0703c");
    door(g, b); if (b.label) plate(g, cx, Y + H - 30, b.label, "#3a2414", "#f4d27a");
  },
  board(g, X, Y, W, H, b) {
    rect(g, X + 3, Y + 10, 3, H - 10, "#4a3018"); rect(g, X + W - 6, Y + 10, 3, H - 10, "#4a3018");
    rect(g, X, Y + 2, W, H - 18, "#1b1b22"); rect(g, X + 1, Y + 3, W - 2, H - 20, "#a0703c");
    for (let i = 0; i < 6; i++) rect(g, X + 6 + (i % 3) * ((W - 18) / 3), Y + 18 + (i / 3 | 0) * 14, 12, 10, i % 2 ? "#fffaf0" : "#f4e3b5");
    rect(g, X - 2, Y, W + 4, 4, "#3a2e22"); plate(g, X + W/2, Y + 4, b.label, "#3a2414", "#f4d27a");
    door(g, b, "#a0703c");
  },
  stall(g, X, Y, W, H, b, c) {
    rect(g, X + 2, Y + H - 22, W - 4, 22, "#1b1b22"); rect(g, X + 3, Y + H - 21, W - 6, 20, "#a0703c");
    for (let i = 0; i < W; i += 6) rect(g, X + i, Y + 6, 6, 12, (i / 6) % 2 ? "#fff" : (c.awning || "#1b1b22"));
    rect(g, X, Y + 18, W, 2, "#1b1b22"); rect(g, X + 2, Y + 20, 2, H - 40, "#4a3018"); rect(g, X + W - 4, Y + 20, 2, H - 40, "#4a3018");
    for (let i = 0; i < 5; i++) rect(g, X + 8 + i * ((W - 24) / 4), Y + H - 30, 7, 8, ["#e4002b","#f4f1e8","#1b1b22","#3d63d6","#ffc83d"][i]);
    plate(g, X + W/2, Y, b.label, "#1b1b22", "#fff"); door(g, b, "#7a5228");
  },
};

// ---------- sprites ----------
function person(g, x, y, dir, f, c) {
  rect(g, x+3, y+14, 10, 2, "#00000035");
  const lA = f === 1 ? 1 : 0, lB = f === 2 ? 1 : 0;
  rect(g, x+5, y+11 - lA, 2, 4, c.pants); rect(g, x+9, y+11 - lB, 2, 4, c.pants);
  rect(g, x+5, y+14 - lA, 2, 1, "#1b1b22"); rect(g, x+9, y+14 - lB, 2, 1, "#1b1b22");
  rect(g, x+4, y+6, 8, 6, c.shirt); rect(g, x+3, y+7, 1, 4, c.shirt); rect(g, x+12, y+7, 1, 4, c.shirt);
  rect(g, x+3, y+11, 1, 1, c.skin); rect(g, x+12, y+11, 1, 1, c.skin);
  if (c.belt) rect(g, x+4, y+10, 8, 1, c.belt);
  rect(g, x+4, y-1, 8, 7, c.skin);
  if (dir === "up") rect(g, x+4, y-2, 8, 7, c.hair);
  else {
    rect(g, x+4, y-2, 8, 3, c.hair); rect(g, x+4, y+1, 1, 2, c.hair); rect(g, x+11, y+1, 1, 2, c.hair);
    const ex = dir === "left" ? [5] : dir === "right" ? [10] : [6, 9];
    ex.forEach(e => rect(g, x+e, y+2, 1, 2, "#1b1b22"));
    if (c.mask) rect(g, x+4, y+4, 8, 2, c.mask);
  }
  if (c.band) { rect(g, x+4, y, 8, 1, c.band); rect(g, x+(dir === "left" ? 12 : 2), y, 2, 1, c.band); }
}
function bot(g, x, y, dir, f, c) {
  rect(g, x+3, y+14, 10, 2, "#00000035");
  rect(g, x+5, y+12, 2, 3, "#3a3f4b"); rect(g, x+9, y+12, 2, 3, "#3a3f4b");
  rect(g, x+3, y+5, 10, 8, "#1b1b22"); rect(g, x+4, y+6, 8, 6, c.body); rect(g, x+6, y+8, 4, 2, "#ffffff80");
  rect(g, x+3, y-2, 10, 8, "#1b1b22"); rect(g, x+4, y-1, 8, 6, "#dfe6ee");
  if (dir !== "up") { rect(g, x+5, y, 6, 4, "#1b1b22"); const ex = dir === "left" ? [6] : dir === "right" ? [9] : [6, 9]; ex.forEach(e => rect(g, x+e, y+1, 1, 2, c.eye)); }
  rect(g, x+7, y-5, 2, 3, "#1b1b22"); rect(g, x+6, y-7, 4, 2, c.eye);
}
const LOOKS = {person, bot};

// ---------- the world ----------
window.startWorld = async function(cfg) {
  await document.fonts.load(FONT).catch(() => {});
  const MW = cfg.w, MH = cfg.h, base = cfg.base || "grass", colors = cfg.colors;
  const grid = v => [...Array(MH)].map(() => Array(MW).fill(v));
  const ground = grid(base), deco = grid(null), solid = grid(false), obj = grid(null), reserved = grid(false);
  const inMap = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH;
  const reserve = (x, y, w, h) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (inMap(i, j)) reserved[j][i] = true; };
  const lanes = [];
  for (const [t, x, y, w = 1, h = 1] of cfg.paint) {
    if (t === "laneH" || t === "laneV") { lanes.push([t, x, y, w]); continue; }
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (inMap(i, j)) ground[j][i] = t;
  }
  const things = [];                       // everything discoverable
  for (const b of cfg.buildings) {
    b.kind = "bld"; b.door ||= [b.x + (b.w >> 1), b.y + b.h - 1];
    for (let j = b.y; j < b.y + b.h; j++) for (let i = b.x; i < b.x + b.w; i++) { solid[j][i] = true; obj[j][i] = b; }
    reserve(b.x - 1, b.y - 1, b.w + 2, b.h + 2); reserve(b.door[0], b.door[1] + 1, 1, 3);
    if (!b.nocount) things.push(b);
  }
  for (const n of cfg.npcs) { n.kind = "npc"; n.dir ||= "down"; solid[n.y][n.x] = true; obj[n.y][n.x] = n; reserve(n.x - 1, n.y - 1, 3, 3); if (!n.nocount) things.push(n); }
  for (const s of cfg.signs || []) { s.kind = "sign"; solid[s.y][s.x] = true; obj[s.y][s.x] = s; deco[s.y][s.x] = "sign"; reserve(s.x - 1, s.y - 1, 3, 3); }
  for (const [t, x, y] of cfg.deco || []) { deco[y][x] = t; solid[y][x] = true; reserve(x, y, 1, 1); }
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (!x || !y || x === MW - 1 || y === MH - 1) {
    solid[y][x] = true; deco[y][x] = ground[y][x] === base ? cfg.border : ground[y][x] === "water" ? null : "barrier";
  }
  seed = cfg.seed || 7;
  for (let y = 1; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) {
    if (reserved[y][x] || ground[y][x] !== base || deco[y][x]) continue;
    let r = rnd();
    for (const [t, p] of cfg.scatter) { if ((r -= p) < 0) { deco[y][x] = t; if (!WALK_DECO.has(t)) solid[y][x] = true; break; } }
  }
  const walkable = (x, y) => inMap(x, y) && !solid[y][x] && ground[y][x] !== "water";
  const idOf = t => t.id || t.content;

  // paint the static world once
  const world = document.createElement("canvas"); world.width = MW * TS; world.height = MH * TS;
  const g = world.getContext("2d");
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) GROUND[ground[y][x]](g, x * TS, y * TS, colors);
  for (const [t, x, y, len] of lanes) for (let i = 0; i < len; i++) {
    const gx = t === "laneH" ? x + i : x, gy = t === "laneH" ? y : y + i;
    if (t === "laneH") rect(g, gx * TS + 2, gy * TS + 7, 8, 2, "#f2c14e"); else rect(g, gx * TS + 7, gy * TS + 2, 2, 8, "#f2c14e");
  }
  const layers = [];
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (deco[y][x]) layers.push([y * TS + TS, () => DECO[deco[y][x]](g, x * TS, y * TS)]);
  for (const b of cfg.buildings) layers.push([(b.y + b.h) * TS, () => STYLE[b.style](g, b.x * TS, b.y * TS, b.w * TS, b.h * TS, b, b.colors || {})]);
  layers.sort((a, b) => a[0] - b[0]).forEach(l => l[1]());

  // ---------- DOM ----------
  const frame = cfg.frame;
  frame.insertAdjacentHTML("beforeend", `
    <canvas class="view" width="${cfg.view[0]}" height="${cfg.view[1]}" aria-label="${esc(cfg.title)} game map"></canvas>
    <div class="hud">
      <button class="chip" data-quests>FOUND <span data-count></span><span class="bar"><i data-bar></i></span></button>
      <button class="chip" data-quests>QUESTS</button>
      <span class="grow"></span>
      <button class="chip" data-snd aria-pressed="false">♪ OFF</button>
      <canvas class="mini" width="${MW * 2}" height="${MH * 2}" aria-hidden="true"></canvas>
    </div>
    <div class="tip" hidden></div>
    <div id="toasts" aria-live="polite"></div>
    <div class="talk px" hidden role="dialog" aria-live="polite"><span class="who"></span><p></p><div class="opts"></div><span class="more">▼</span></div>
    <div class="card px" hidden role="dialog" aria-labelledby="ctitle"><div class="ch"></div><div class="cb"></div></div>
    <div class="pad" hidden><button class="u" data-dir="up">▲</button><button class="l" data-dir="left">◀</button><button class="r" data-dir="right">▶</button><button class="d" data-dir="down">▼</button></div>
    <button class="abtn" hidden aria-label="Talk or enter">A</button>
    <div class="fade"></div>
    <div class="title"><div><h2>${cfg.titleHtml}</h2>${cfg.intro.map(p => `<p>${esc(p)}</p>`).join("")}
      <button class="pbtn start">▶ PRESS START</button>
      <div class="keys">ARROWS / WASD TO WALK · CLICK OR TAP TO MOVE<br>WALK INTO PEOPLE & DOORS TO TALK · E TO INTERACT · ESC TO CLOSE</div></div></div>`);
  const $ = s => frame.querySelector(s);
  const cv = $("canvas.view"), ctx = cv.getContext("2d"), VW = cv.width, VH = cv.height;
  ctx.imageSmoothingEnabled = false;
  const mini = $(".mini"), mctx = mini.getContext("2d");
  const miniBase = document.createElement("canvas"); miniBase.width = mini.width; miniBase.height = mini.height;
  miniBase.getContext("2d").drawImage(world, 0, 0, mini.width, mini.height);
  const talk = $(".talk"), card = $(".card"), tip = $(".tip"), fade = $(".fade"), title = $(".title");

  // ---------- progress ----------
  let seen = new Set();
  try { seen = new Set(JSON.parse(localStorage.getItem(cfg.key) || "[]")); } catch {}
  const total = things.length;
  function progress() {
    frame.querySelector("[data-count]").textContent = `${seen.size}/${total}`;
    frame.querySelector("[data-bar]").style.width = (100 * seen.size / total) + "%";
  }
  function discover(t) {
    const id = idOf(t); if (!id || t.nocount || seen.has(id)) return;
    seen.add(id); try { localStorage.setItem(cfg.key, JSON.stringify([...seen])); } catch {}
    toast(`✦ FOUND: ${(t.name || PROFILE[t.content]?.name || id).toUpperCase()} · ${seen.size}/${total}`); beep([523, 784], .07);
    for (const q of cfg.quests) if (q.ids.includes(id) && q.ids.every(i => seen.has(i))) setTimeout(() => { toast(`★ QUEST COMPLETE: ${q.name.toUpperCase()}`); beep([523, 659, 784, 1047], .09); }, 600);
    if (seen.size === total) setTimeout(() => { toast("★★★ YOU FOUND EVERYTHING ★★★"); showCard("next"); }, 1400);
    progress();
  }
  function toast(t) { const d = document.createElement("div"); d.className = "toast px"; d.textContent = t; $("#toasts").append(d); setTimeout(() => d.remove(), 3000); }

  // ---------- sound (off by default) ----------
  let audio = null, sound = false;
  function beep(notes, len, vol = .05) {
    if (!sound) return; audio ||= new AudioContext();
    notes.forEach((f, i) => { const o = audio.createOscillator(), gn = audio.createGain(), t = audio.currentTime + i * len;
      o.type = "square"; o.frequency.value = f; gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(.0001, t + len);
      o.connect(gn).connect(audio.destination); o.start(t); o.stop(t + len); });
  }
  $("[data-snd]").onclick = e => { sound = !sound; e.currentTarget.textContent = sound ? "♪ ON" : "♪ OFF"; e.currentTarget.setAttribute("aria-pressed", sound); beep([660], .05); };

  // ---------- player + movement ----------
  const P = {x: cfg.spawn[0], y: cfg.spawn[1], dir: "down", step: null, frame: 0, look: cfg.player};
  P.px = P.x * TS; P.py = P.y * TS;
  const held = []; let path = [], fresh = false;
  const uiOpen = () => !talk.hidden || !card.hidden || !title.hidden;

  function tryMove(d) {
    const bump = typeof d === "object", dir = bump ? d.bump : d, [dx, dy] = DIRS[dir];
    P.dir = dir;
    const nx = P.x + dx, ny = P.y + dy;
    if (!bump && walkable(nx, ny)) { P.step = {fx: P.x, fy: P.y, tx: nx, ty: ny, t: 0}; return; }
    path = [];
    const o = inMap(nx, ny) && obj[ny][nx];
    if (o && (bump || (fresh && held.includes(dir)))) { fresh = false; interact(o); }
  }
  function interact(o) {
    held.length = 0;
    if (o.kind === "npc") o.dir = {up: "down", down: "up", left: "right", right: "left"}[P.dir], kick();
    if (o.action === "travel") return showTravel(o);
    if (o.kind === "sign") return say(o.name || "Sign", o.lines);
    if (o.kind === "npc") { discover(o); return say(o.name || PROFILE[o.content].name, o.lines || [PROFILE[o.content].blurb], o.content); }
    discover(o); showCard(o.content);
  }

  // BFS for click/tap-to-walk
  function route(goals) {
    const [sx, sy] = here(), idx = (x, y) => y * MW + x, prev = new Int32Array(MW * MH).fill(-2), q = [idx(sx, sy)];
    prev[q[0]] = -1;
    for (let h = 0; h < q.length; h++) {
      const c = q[h], cx = c % MW, cy = (c / MW) | 0;
      if (goals.has(c)) { const out = []; for (let k = c; prev[k] !== -1; k = prev[k]) out.unshift(k); return out.map((k, i) => { const p = i ? out[i-1] : idx(sx, sy); const d = k - p; return d === 1 ? "right" : d === -1 ? "left" : d === MW ? "down" : "up"; }); }
      for (const [dx, dy] of Object.values(DIRS)) { const nx = cx + dx, ny = cy + dy; if (walkable(nx, ny) && prev[idx(nx, ny)] === -2) { prev[idx(nx, ny)] = c; q.push(idx(nx, ny)); } }
    }
    return null;
  }
  const here = () => P.step ? [P.step.tx, P.step.ty] : [P.x, P.y];
  function walkTo(tx, ty) {
    if (!inMap(tx, ty)) return;
    const o = obj[ty][tx];
    if (walkable(tx, ty)) { path = route(new Set([ty * MW + tx])) || []; return kick(); }
    if (!o) return;
    // stand next to it (doors first), then bump into it
    const spots = o.kind === "bld" ? [[o.door[0], o.door[1] + 1, "up"]] : [[o.x, o.y + 1, "up"], [o.x, o.y - 1, "down"], [o.x - 1, o.y, "right"], [o.x + 1, o.y, "left"]];
    const ok = spots.filter(([x, y]) => walkable(x, y));
    const [hx, hy] = here(), at = ok.find(([x, y]) => x === hx && y === hy);
    if (at) { path = [{bump: at[2]}]; return kick(); }
    const r = route(new Set(ok.map(([x, y]) => y * MW + x)));
    if (!r) return;
    let ex = hx, ey = hy; r.forEach(d => { ex += DIRS[d][0]; ey += DIRS[d][1]; });
    path = [...r, {bump: ok.find(([x, y]) => x === ex && y === ey)[2]}]; kick();
  }

  // ---------- loop (sleeps when nothing moves) ----------
  let raf = 0, last = 0, camX = 0, camY = 0;
  function tick(now) {
    const dt = Math.min(.05, (now - (last || now)) / 1000); last = now;
    if (P.step) {
      P.step.t += dt / STEP; const t = Math.min(1, P.step.t);
      P.px = (P.step.fx + (P.step.tx - P.step.fx) * t) * TS; P.py = (P.step.fy + (P.step.ty - P.step.fy) * t) * TS;
      if (t >= 1) { P.x = P.step.tx; P.y = P.step.ty; P.step = null; P.frame = P.frame === 1 ? 2 : 1; }
    }
    if (!P.step && !uiOpen()) { const d = path.length ? path.shift() : held[held.length - 1]; if (d) tryMove(d); }
    render();
    raf = (P.step || path.length || (held.length && !uiOpen())) ? requestAnimationFrame(tick) : (last = 0);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };

  function render() {
    camX = Math.round(Math.max(0, Math.min(MW * TS - VW, P.px + 8 - VW / 2)));
    camY = Math.round(Math.max(0, Math.min(MH * TS - VH, P.py + 8 - VH / 2)));
    ctx.drawImage(world, camX, camY, VW, VH, 0, 0, VW, VH);
    const sprites = cfg.npcs.filter(n => Math.abs(n.x * TS - camX - VW/2) < VW && Math.abs(n.y * TS - camY - VH/2) < VH)
      .map(n => [n.y * TS, () => LOOKS[n.look](ctx, n.x * TS - camX, n.y * TS - camY - 3, n.dir, 0, n.colors)]);
    sprites.push([P.py, () => LOOKS[P.look.look](ctx, Math.round(P.px - camX), Math.round(P.py - camY - 3), P.dir, P.step ? P.frame : 0, P.look.colors)]);
    sprites.sort((a, b) => a[0] - b[0]).forEach(s => s[1]());
    for (const n of cfg.npcs) if (!seen.has(idOf(n)) && !n.nocount) { const sx = n.x * TS - camX + 7, sy = n.y * TS - camY - 14; if (sx > -8 && sx < VW && sy > -8 && sy < VH) { rect(ctx, sx, sy, 2, 5, "#ffc83d"); rect(ctx, sx, sy + 6, 2, 2, "#ffc83d"); } }
    mctx.drawImage(miniBase, 0, 0);
    mctx.strokeStyle = "#fff"; mctx.lineWidth = 1; mctx.strokeRect(camX / 8 + .5, camY / 8 + .5, VW / 8, VH / 8);
    rect(mctx, P.px / 8 - 1, P.py / 8 - 1, 4, 4, cfg.player.colors.shirt);
  }

  // ---------- speech box ----------
  let pages = [], page = 0, typing = null, talkContent = null;
  function say(who, lines, content) {
    pages = lines; page = 0; talkContent = content;
    talk.querySelector(".who").textContent = who; talk.hidden = false; showPage();
  }
  function showPage() {
    const p = talk.querySelector("p"), text = pages[page], opts = talk.querySelector(".opts");
    opts.innerHTML = ""; talk.querySelector(".more").hidden = true;
    let i = 0; clearInterval(typing);
    const done = () => {
      clearInterval(typing); typing = null; p.textContent = text;
      const lastPage = page === pages.length - 1;
      talk.querySelector(".more").hidden = lastPage && !!talkContent;
      if (lastPage && talkContent) opts.innerHTML = `<button class="pbtn" data-open>▶ MORE</button><button class="pbtn" data-close>BYE</button>`;
    };
    talk.finish = done;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return done();
    typing = setInterval(() => { i += 2; p.textContent = text.slice(0, i); if (i % 6 === 0) beep([880], .015, .02); if (i >= text.length) done(); }, 16);
  }
  function advance() {
    if (typing) return talk.finish();
    if (page < pages.length - 1) { page++; return showPage(); }
    if (talkContent) return; // waiting on MORE / BYE
    closeTalk();
  }
  function closeTalk() { talk.hidden = true; clearInterval(typing); typing = null; kick(); }
  talk.addEventListener("click", e => {
    if (e.target.closest("[data-open]")) { const c = talkContent; closeTalk(); return showCard(c); }
    if (e.target.closest("[data-close]")) return closeTalk();
    advance();
  });

  // ---------- detail card ----------
  const COLORS = ["#e4002b","#ffc83d","#3d63d6","#14b894","#a34bd1","#ff9a1f"];
  function showCard(id, html) {
    const s = PROFILE[id] || {};
    card.querySelector(".ch").innerHTML = `<small>${esc(s.kicker || "")}</small><h2 id="ctitle">${esc(s.name || id)}</h2><div>${esc(s.sub || "")}</div><button class="pbtn x" aria-label="Close">X</button>`;
    card.querySelector(".cb").innerHTML = html || (
      (s.todo ? `<div class="todo">To do: ${esc(s.todo)}</div>` : "") + `<p>${esc(s.blurb)}</p>` +
      (s.stats ? `<div class="stats">${s.stats.map(([b, t]) => `<div><b>${esc(b)}</b><span>${esc(t)}</span></div>`).join("")}</div>` : "") +
      (s.items ? `<div class="inv"><h4>${esc(s.itemsTitle)}</h4>${s.items.map(([n, d], i) => `<div class="item"><i style="background:${COLORS[i % 6]}"></i><div><strong>${esc(n)}</strong><span>${esc(d)}</span></div></div>`).join("")}</div>` : "") +
      (s.repos ? `<h4>Contributions</h4><img class="heat" src="https://ghchart.rshah.org/e4002b/aayanrehman" alt="GitHub contribution chart"><h4>Latest pushes</h4><div data-repos>Loading…</div>` : "") +
      (s.tags ? `<div class="tags">${s.tags.map(t => `<span>${esc(t)}</span>`).join("")}</div>` : "") +
      (s.links ? `<div>${s.links.map(([t, u]) => `<a class="pbtn" href="${esc(u)}" target="_blank" rel="noopener">${esc(t)} ↗</a>`).join("")}</div>` : ""));
    card.querySelector(".x").onclick = closeCard;
    card.hidden = false; card.querySelector(".cb").scrollTop = 0;
    if (s.repos) loadRepos();
  }
  function closeCard() { card.hidden = true; kick(); }
  let repoHtml;
  function loadRepos() {
    const put = h => { const el = card.querySelector("[data-repos]"); if (el) el.innerHTML = h; };
    if (repoHtml) return put(repoHtml);
    fetch("https://api.github.com/users/aayanrehman/repos?sort=pushed&per_page=10").then(r => r.ok ? r.json() : Promise.reject())
      .then(rs => put(repoHtml = rs.filter(r => !r.fork && r.name !== "aayanrehman").slice(0, 8).map(r =>
        `<a class="repo" href="${esc(r.html_url)}" target="_blank" rel="noopener"><b>${esc(r.name)}</b><span>${esc(r.language || "")}${r.description ? " · " + esc(r.description) : ""}</span></a>`).join("")))
      .catch(() => put(`<a class="repo" href="https://github.com/aayanrehman" target="_blank" rel="noopener"><b>github.com/aayanrehman</b><span>Feed offline, visit directly</span></a>`));
  }
  function showQuests() {
    const name = id => PROFILE[id]?.name || cfg.npcs.find(n => n.id === id)?.name || id;
    showCard("_q", cfg.quests.map(q => { const n = q.ids.filter(i => seen.has(i)).length;
      return `<div class="q"><b>${n === q.ids.length ? "★ " : ""}${esc(q.name)} · ${n}/${q.ids.length}</b><span class="bar"><i style="width:${100 * n / q.ids.length}%"></i></span>
        <span style="font-size:13px;color:#555">${q.ids.map(i => seen.has(i) ? esc(name(i)) : "???").join(" · ")}</span></div>`; }).join("") +
      `<p style="font-size:14px;color:#555">Progress is saved in this browser.</p>`);
    card.querySelector("h2").textContent = "Quests"; card.querySelector("small").textContent = `${seen.size}/${total} found`;
  }
  frame.querySelectorAll("[data-quests]").forEach(b => b.onclick = showQuests);
  function showTravel(o) {
    showCard("_t", `<p>${esc(o.travelText)}</p>` + cfg.stops.map((s, i) => `<button class="pbtn" data-stop="${i}">${esc(s.name)}</button>`).join(""));
    card.querySelector("h2").textContent = o.name; card.querySelector("small").textContent = "Fast travel";
    card.querySelectorAll("[data-stop]").forEach(b => b.onclick = () => {
      const s = cfg.stops[+b.dataset.stop]; closeCard(); fade.classList.add("on"); beep([392, 523], .08);
      setTimeout(() => { P.x = s.x; P.y = s.y; P.px = s.x * TS; P.py = s.y * TS; P.dir = "down"; path = []; render(); fade.classList.remove("on"); toast(s.name.toUpperCase()); }, 280);
    });
  }

  // ---------- input ----------
  const KEYDIR = {ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down", ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right"};
  function interactAhead() { const [dx, dy] = DIRS[P.dir], o = inMap(P.x + dx, P.y + dy) && obj[P.y + dy][P.x + dx]; if (o) interact(o); }
  document.addEventListener("keydown", e => {
    // leave the page alone when typing, using page links, or when the game is scrolled out of view
    if (e.target.closest?.("input, textarea, a, summary") || (e.target.closest?.("button") && !frame.contains(e.target))) return;
    const fr = frame.getBoundingClientRect(); if (fr.bottom < 80 || fr.top > innerHeight - 80) return;
    const k = e.key;
    if (!title.hidden) { if (k === "Enter" || k === " ") { e.preventDefault(); start(); } return; }
    if (k === "Escape") { if (!card.hidden) closeCard(); else if (!talk.hidden) closeTalk(); return; }
    if (!card.hidden) return;
    if (!talk.hidden) { if (k === "Enter" || k === " " || k === "e" || k === "E") { e.preventDefault(); if (!e.target.closest?.("button")) advance(); } return; }
    const d = KEYDIR[k];
    if (d) { e.preventDefault(); if (!held.includes(d)) { held.push(d); fresh = true; } path = []; kick(); }
    else if ((k === "e" || k === "E" || k === "Enter" || k === " ") && !e.target.closest?.("button, a")) { e.preventDefault(); interactAhead(); }
  });
  document.addEventListener("keyup", e => { const d = KEYDIR[e.key]; if (d && held.includes(d)) held.splice(held.indexOf(d), 1); if (!held.length) fresh = false; });
  window.addEventListener("blur", () => held.length = 0);

  const toTile = e => { const r = cv.getBoundingClientRect(); return [Math.floor(((e.clientX - r.left) * VW / r.width + camX) / TS), Math.floor(((e.clientY - r.top) * VH / r.height + camY) / TS)]; };
  cv.addEventListener("click", e => { if (uiOpen()) return; const [x, y] = toTile(e); walkTo(x, y); });
  cv.addEventListener("mousemove", e => {
    const [x, y] = toTile(e), o = inMap(x, y) && obj[y][x];
    cv.style.cursor = o ? "pointer" : "default";
    if (o) { const r = frame.getBoundingClientRect(); tip.hidden = false; tip.textContent = o.label ? (PROFILE[o.content]?.name || o.label) : (o.name || PROFILE[o.content]?.name || "Sign"); tip.style.left = (e.clientX - r.left) + "px"; tip.style.top = (e.clientY - r.top) + "px"; }
    else tip.hidden = true;
  });
  cv.addEventListener("mouseleave", () => tip.hidden = true);

  if (matchMedia("(pointer: coarse)").matches) {
    $(".pad").hidden = $(".abtn").hidden = false;
    frame.querySelectorAll(".pad button").forEach(b => {
      b.addEventListener("pointerdown", e => { e.preventDefault(); held.push(b.dataset.dir); fresh = true; path = []; kick(); });
      for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, () => held.splice(held.indexOf(b.dataset.dir) >>> 0, 1));
    });
    $(".abtn").onclick = () => !talk.hidden ? advance() : interactAhead();
  }

  // ---------- start ----------
  function start() { title.hidden = true; toast(cfg.startToast); kick(); }
  $(".start").onclick = start;
  if (seen.size) $(".start").textContent = `▶ CONTINUE · ${seen.size}/${total} FOUND`;
  progress(); render();

  // dev check: every door and NPC must be reachable from spawn
  const near = (x, y) => new Set(Object.values(DIRS).map(([dx, dy]) => [x + dx, y + dy]).filter(([i, j]) => walkable(i, j)).map(([i, j]) => j * MW + i));
  const bad = [...cfg.buildings.map(b => [new Set(walkable(b.door[0], b.door[1] + 1) ? [(b.door[1] + 1) * MW + b.door[0]] : []), b.content || b.name]),
               ...cfg.npcs.map(n => [near(n.x, n.y), n.id || n.content])]
    .filter(([goals]) => !goals.size || !route(goals)).map(x => x[1]);
  if (bad.length) console.warn("Unreachable:", bad);
  return {P, walkTo, interact, tick, seen, things, showCard, bad};
};
})();

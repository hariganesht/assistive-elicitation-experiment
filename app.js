import * as THREE from "three";

const LEVELS={
  furniture:["connected-l","sofa-chairs","sofa-beanbag","four-armchairs"],
  lighting:["bright-overhead","localized-lamps","pendant-cluster","chandelier"],
  wall:["neutral","warm","dark","brick"],
  decor:["photo-frames","bicycle","wall-bookshelf"]
};
const FEATURE_LABELS={furniture:"furniture",lighting:"lighting",wall:"walls",decor:"decor"};
let current=null, completedTurns=0, events=[], ended=false;
const DESCRIPTION_CHARACTER_LIMIT=150;
const cp=x=>({...x});
const key=x=>Object.values(x).join("|");
const rand=a=>a[Math.floor(Math.random()*a.length)];
function randomConfig(ex=[]){
  const banned=new Set(ex.filter(Boolean).map(key));
  for(;;){
    const x={};
    for(const f in LEVELS)x[f]=rand(LEVELS[f]);
    if(!banned.has(key(x)))return x;
  }
}
function log(action,data={}){events.push({turn:completedTurns,action,current:current&&cp(current),...data});console.log(events)}

class Room{
  constructor(el,config){
    this.el=el;this.s=new THREE.Scene();this.s.background=new THREE.Color(0xe7e3dc);
    this.cam=new THREE.PerspectiveCamera(43,1,.1,100);this.cam.position.set(0,3.8,12.8);this.cam.lookAt(0,2.15,-.5);
    this.r=new THREE.WebGLRenderer({antialias:true});this.r.outputColorSpace=THREE.SRGBColorSpace;this.r.toneMapping=THREE.ACESFilmicToneMapping;el.appendChild(this.r.domElement);
    this.wall=new THREE.MeshStandardMaterial({color:0xeee8df,roughness:.9});this.wood=new THREE.MeshStandardMaterial({color:0x704b32,roughness:.8});this.fabric=new THREE.MeshStandardMaterial({color:0xb4aa9d,roughness:1});this.fabric2=new THREE.MeshStandardMaterial({color:0x88796d,roughness:1});this.white=new THREE.MeshStandardMaterial({color:0xf2efe9});this.dark=new THREE.MeshStandardMaterial({color:0x343637});
    this.fixed=new THREE.Group();this.furn=new THREE.Group();this.fx=new THREE.Group();this.dec=new THREE.Group();this.lit=new THREE.Group();this.s.add(this.fixed,this.furn,this.fx,this.dec,this.lit);this.build();this.s.add(new THREE.HemisphereLight(0xfff4dc,0x66717a,.52));new ResizeObserver(()=>this.resize()).observe(el);this.set(config);this.resize();this.anim();
  }
  box(w,h,d,m,x,y,z){const q=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);q.position.set(x,y,z);return q}
  cyl(r,h,m,x,y,z){const q=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,32),m);q.position.set(x,y,z);return q}
  clear(g){while(g.children.length)g.remove(g.children[0])}
  build(){this.fixed.add(this.box(13,.14,9,new THREE.MeshStandardMaterial({color:0x815d43}),0,0,-.4),this.box(13,5.8,.14,this.wall,0,2.9,-4.9),this.box(.14,5.8,9,this.wall,-6.5,2.9,-.4),this.box(.14,5.8,9,this.wall,6.5,2.9,-.4),this.box(13,.14,9,this.white,0,5.8,-.4));this.fixed.add(this.box(6.8,.03,4.4,new THREE.MeshStandardMaterial({color:0xc6b79f}),0,.09,-.1),this.box(2.3,.18,1.15,this.wood,0,.62,.45));for(const x of [-.92,.92])for(const z of [.05,.85])this.fixed.add(this.box(.12,.55,.12,this.wood,x,.32,z));this.fixed.add(this.box(3.35,2.85,.1,this.wood,-3.85,3.05,-4.77),this.box(2.98,1.62,.025,new THREE.MeshStandardMaterial({color:0x8fc4dc}),-3.85,3.48,-4.73),this.box(2.98,.82,.025,new THREE.MeshStandardMaterial({color:0x718d5d}),-3.85,2.26,-4.72),this.box(.07,2.48,.05,this.white,-3.85,3.05,-4.56),this.box(2.98,.07,.05,this.white,-3.85,3.05,-4.56))}
  chair(x,z,rot=0,m=this.fabric2){const g=new THREE.Group();g.add(this.box(1.12,.46,1.12,m,0,.56,0),this.box(1.12,.86,.2,m,0,1.15,-.46));g.position.set(x,0,z);g.rotation.y=rot;this.furn.add(g)}
  sofa(x,z,w,rot=0,m=this.fabric){const g=new THREE.Group();g.add(this.box(w,.48,1.15,m,0,.58,0),this.box(w,.82,.22,m,0,1.15,-.48));g.position.set(x,0,z);g.rotation.y=rot;this.furn.add(g)}
  setF(t){this.clear(this.furn);if(t==="connected-l"){this.furn.add(this.box(5.85,.5,1.18,this.fabric,.55,.58,-2.55),this.box(1.2,.5,3.15,this.fabric,-1.78,.58,-1.55),this.box(5.85,.82,.22,this.fabric,.55,1.15,-3.03),this.box(.22,.82,2.95,this.fabric,-2.32,1.15,-1.57))}if(t==="sofa-chairs"){this.sofa(0,-2.55,3.55);this.chair(-3,-.35,Math.PI/3);this.chair(3,-.35,-Math.PI/3)}if(t==="sofa-beanbag"){this.sofa(-.65,-2.55,3.25);const m=new THREE.MeshStandardMaterial({color:0x9b715b,roughness:1}),b=new THREE.Mesh(new THREE.SphereGeometry(1,32,22),m);b.scale.set(1.18,.52,1.05);b.position.set(2.65,.48,-.30);this.furn.add(b)}if(t==="four-armchairs"){this.chair(-2.1,-1.85,Math.PI/4);this.chair(2.1,-1.85,-Math.PI/4);this.chair(-2.1,1.05,Math.PI*.72);this.chair(2.1,1.05,-Math.PI*.72);this.furn.add(this.cyl(.68,.1,this.wood,0,.58,-.25),this.cyl(.1,.54,this.wood,0,.3,-.25))}}
  setW(t){this.clear(this.fx);this.wall.color.setHex({neutral:0xeee8df,warm:0xb96f4f,dark:0x30363a,brick:0x6f4035}[t]);if(t==="brick"){const ms=[0x5d3029,0x71392e,0x472722].map(c=>new THREE.MeshStandardMaterial({color:c,roughness:1}));for(let r=0;r<18;r++){const y=.25+r*.31,o=(r%2)*.38;for(let x=-6.1-o;x<6.2;x+=.77)this.fx.add(this.box(.7,.26,.04,ms[(r+Math.floor(x+10))%3],x,y,-4.78));}}}
  setD(t){this.clear(this.dec);if(t==="photo-frames"){for(const [x,y,w,h,c] of [[-.9,3.5,1.15,1.25,0xb54e3c],[.65,3.2,1.35,.9,0x3f6f80],[2.25,3.55,.9,1.15,0xd09b43]]){const frame=this.box(w+.12,h+.12,.05,this.dark,x,y,-4.65),art=this.box(w,h,.06,new THREE.MeshStandardMaterial({color:c}),x,y,-4.61);this.dec.add(frame,art)}}if(t==="bicycle"){const mat=this.dark;for(const x of [-.72,.72]){const wheel=new THREE.Mesh(new THREE.TorusGeometry(.55,.045,10,32),mat);wheel.position.set(x,2.55,-4.61);this.dec.add(wheel)}const bar=(len,x,y,rot)=>{const q=this.box(len,.07,.07,mat,x,y,-4.6);q.rotation.z=rot;this.dec.add(q)};bar(1.55,0,2.62,0);bar(1.1,-.2,2.82,.75);bar(1.05,.25,2.85,-.7);bar(.8,.35,3.15,.25)}if(t==="wall-bookshelf"){for(let r=0;r<3;r++){this.dec.add(this.box(3.4,.12,.42,this.wood,1.2,2.05+r*.75,-4.48));for(let i=0;i<7;i++){const colors=[0x8d5947,0x526b75,0xb38a55,0x6d7658];const h=.38+(i%3)*.08;this.dec.add(this.box(.18,h,.24,new THREE.MeshStandardMaterial({color:colors[(i+r)%colors.length]}),-.05+i*.4,2.3+r*.75,-4.23))}}}}
  setL(t){this.clear(this.lit);const add=(x,y,z,p,col=0xffd39c)=>{const l=new THREE.PointLight(col,p,10,1.4);l.position.set(x,y,z);this.lit.add(l)};if(t==="bright-overhead")for(const [x,z] of [[-3,-1.7],[0,-1.7],[3,-1.7],[-3,1.4],[0,1.4],[3,1.4]]){const disc=new THREE.Mesh(new THREE.CylinderGeometry(.32,.32,.07,36),this.white);disc.rotation.x=Math.PI/2;disc.position.set(x,5.69,z);this.lit.add(disc);add(x,5.15,z,18,0xffe8c9)}if(t==="localized-lamps")for(const [x,z] of [[-4.2,-.6],[4.2,-.6]]){this.lit.add(this.cyl(.08,2.1,this.dark,x,1.1,z),this.cyl(.55,.62,this.white,x,2.25,z));add(x,2.15,z,38)}if(t==="pendant-cluster")for(const [x,y,z] of [[-1.15,4.25,-.45],[0,3.92,-.15],[1.15,4.35,-.45]]){this.lit.add(this.cyl(.035,1.25,this.dark,x,y+.65,z));const sh=new THREE.Mesh(new THREE.ConeGeometry(.38,.48,24,1,true),new THREE.MeshStandardMaterial({color:0x5e625f,side:THREE.DoubleSide}));sh.position.set(x,y,z);this.lit.add(sh);add(x,y-.18,z,24)}if(t==="chandelier"){const stem=this.cyl(.05,1.15,this.dark,0,4.8,-.3);this.lit.add(stem);const hub=this.cyl(.14,.16,this.dark,0,4.18,-.3);this.lit.add(hub);for(let i=0;i<6;i++){const a=i*Math.PI/3,x=Math.cos(a)*1.15,z=-.3+Math.sin(a)*1.15;const arm=this.box(1.18,.06,.06,this.dark,Math.cos(a)*.58,4.12,-.3+Math.sin(a)*.58);arm.rotation.y=-a;this.lit.add(arm);const candle=this.cyl(.075,.34,this.white,x,3.98,z);this.lit.add(candle);const bulb=new THREE.Mesh(new THREE.SphereGeometry(.12,18,12),new THREE.MeshStandardMaterial({color:0xffe0a6,emissive:0xffc56e,emissiveIntensity:.8}));bulb.position.set(x,3.75,z);this.lit.add(bulb);add(x,3.7,z,12)}}}
  set(c){this.setF(c.furniture);this.setW(c.wall);this.setD(c.decor);this.setL(c.lighting)}
  resize(){const w=this.el.clientWidth,h=this.el.clientHeight;if(!w||!h)return;this.cam.aspect=w/h;this.cam.updateProjectionMatrix();this.r.setSize(w,h,false)}
  anim(){this.r.render(this.s,this.cam);requestAnimationFrame(()=>this.anim())}
}

function roomHTML(label=""){const wrap=document.createElement("div");wrap.className="room-block";const view=document.createElement("div");view.className="room-view";wrap.appendChild(view);if(label){const c=document.createElement("div");c.className="room-caption";c.textContent=label;wrap.appendChild(c)}return {wrap,view}}
function addAssistantMessage(text,config=null){const msg=document.createElement("div");msg.className="message assistant-message";msg.innerHTML=`<div class="sender">Assistant</div><p>${text}</p>`;if(config){const r=roomHTML("Current room");msg.appendChild(r.wrap);new Room(r.view,config)}document.querySelector("#chat").appendChild(msg);return msg}
function addUserMessage(text){const msg=document.createElement("div");msg.className="message user-message";msg.innerHTML=`<div class="sender">You</div><p></p>`;msg.querySelector("p").textContent=text;document.querySelector("#chat").appendChild(msg)}
function scrollBottom(){setTimeout(()=>window.scrollTo({top:document.body.scrollHeight,behavior:"smooth"}),80)}
function updateTurn(){document.querySelector("#turnLabel").textContent=`Turn: ${completedTurns}`;document.querySelector("#finalizeBar").classList.toggle("hidden",completedTurns<3||ended)}
function finishTurn(action,selected=null){log(action,{selected:selected&&cp(selected)});if(selected)current=cp(selected);completedTurns++;updateTurn();addUserMessage(action);setTimeout(()=>presentRandomQuery(),120);scrollBottom()}
function optionCard(config,label,onChoose){const card=document.createElement("div");card.className="option-card";const r=roomHTML(label);card.appendChild(r.wrap);const b=document.createElement("button");b.className="button";b.textContent="Prefer";b.onclick=onChoose;card.appendChild(b);new Room(r.view,config);return card}
function presentRandomQuery(){if(ended)return;const mode=rand(["compare","eval","replace"]);const msg=addAssistantMessage("Here is your current room configuration.",current);const q=document.createElement("div");q.className="query-card";msg.appendChild(q);
  if(mode==="compare"){
    const k=1+Math.floor(Math.random()*4),candidates=[];while(candidates.length<k)candidates.push(randomConfig([current,...candidates]));
    q.innerHTML=`<h3>Do you prefer one of these ${k} room${k===1?"":"s"}, or your current room?</h3>`;const grid=document.createElement("div");grid.className=`query-options ${k===1?"one":k===3?"three":k===4?"four":""}`;q.appendChild(grid);candidates.forEach((c,i)=>grid.appendChild(optionCard(c,`Option ${i+1}`,()=>finishTurn(`I prefer option ${i+1}.`,c))));const actions=document.createElement("div");actions.className="query-actions";const cur=document.createElement("button");cur.className="button";cur.textContent="Prefer current room";cur.onclick=()=>finishTurn("I prefer the current room.",current);const none=document.createElement("button");none.className="button";none.textContent="None of these";none.onclick=()=>finishTurn("I do not prefer any option shown.",null);actions.append(cur,none);q.appendChild(actions);log("query",{mode,k,candidates:candidates.map(cp)});
  } else if(mode==="eval"){
    q.innerHTML="<h3>Do you prefer this room as it is?</h3>";const actions=document.createElement("div");actions.className="eval-actions";for(const [label,text] of [["Yes","Yes, I prefer this room."],["No","No, I do not prefer this room."]]){const b=document.createElement("button");b.className="button";b.textContent=label;b.onclick=()=>finishTurn(text,label==="Yes"?current:null);actions.appendChild(b)}q.appendChild(actions);log("query",{mode});
  } else {
    const feature=rand(Object.keys(LEVELS));const alternatives=LEVELS[feature].filter(v=>v!==current[feature]);const value=rand(alternatives);const candidate={...current,[feature]:value};q.innerHTML=`<h3>Would you prefer to change the ${FEATURE_LABELS[feature]}?</h3>`;const change=document.createElement("div");change.className="single-change";const r=roomHTML("Proposed change");change.appendChild(r.wrap);const actions=document.createElement("div");actions.className="change-actions";const prefer=document.createElement("button");prefer.className="button";prefer.textContent="Prefer";prefer.onclick=()=>finishTurn(`Yes, change the ${FEATURE_LABELS[feature]}.`,candidate);const no=document.createElement("button");no.className="button";no.textContent="Keep current";no.onclick=()=>finishTurn(`No, keep the current ${FEATURE_LABELS[feature]}.`,current);actions.append(prefer,no);change.appendChild(actions);q.appendChild(change);new Room(r.view,candidate);log("query",{mode,feature,candidate:cp(candidate)});
  }
  scrollBottom();
}

document.querySelector("#proceed").onclick=()=>{document.querySelector("#homePage").classList.add("hidden");document.querySelector("#taskPage").classList.remove("hidden");window.scrollTo(0,0)};
document.querySelector("#sendDescription").onclick=()=>{const input=document.querySelector("#description"),text=input.value.trim();if(!text)return;if(text.length>DESCRIPTION_CHARACTER_LIMIT){input.setCustomValidity(`Please keep your description to ${DESCRIPTION_CHARACTER_LIMIT} characters or fewer.`);input.reportValidity();return;}input.setCustomValidity("");addUserMessage(text);document.querySelector("#initialPrompt").classList.add("hidden");current=randomConfig();log("initial_description",{description:text});setTimeout(()=>{addAssistantMessage("Thank you. I have initialized a room design and will now show you different queries to help you refine it.");presentRandomQuery()},150);scrollBottom()};

const descriptionInput=document.querySelector("#description");
const descriptionLimit=document.querySelector("#descriptionLimit");
descriptionInput.maxLength=DESCRIPTION_CHARACTER_LIMIT;
function updateDescriptionLimit(){
  const count=descriptionInput.value.length;
  descriptionLimit.textContent=`${count} / ${DESCRIPTION_CHARACTER_LIMIT} characters`;
}
descriptionInput.addEventListener("input",updateDescriptionLimit);
updateDescriptionLimit();

document.querySelector("#description").addEventListener("keydown",e=>{if((e.metaKey||e.ctrlKey)&&e.key==="Enter")document.querySelector("#sendDescription").click()});
document.querySelector("#satisfied").onclick=()=>document.querySelector("#confirmModal").classList.remove("hidden");
document.querySelector("#cancelFinalize").onclick=()=>document.querySelector("#confirmModal").classList.add("hidden");
document.querySelector("#confirmFinalize").onclick=()=>{document.querySelector("#confirmModal").classList.add("hidden");ended=true;log("finalized");document.querySelector("#finalizeBar").classList.add("hidden");addUserMessage("I am satisfied with this design.");const msg=addAssistantMessage(`Your design has been finalized after ${completedTurns} turn${completedTurns===1?"":"s"}.`,current);msg.classList.add("final-message");scrollBottom()};
updateTurn();

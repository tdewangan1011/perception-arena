import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { pathways, streamColors, type CorticalStream, type PathwayMode } from "./pathway-data";

type Controls = { redraw: () => void; view: (preset: string) => void };
const brainUrl = "./brain/fsaverage5.glb";

export default function BrainPathway({ mode }: { mode: PathwayMode }) {
  const data = pathways[mode];
  const host = useRef<HTMLDivElement>(null);
  const markerLabel = useRef<HTMLDivElement>(null);
  const api = useRef<Controls | null>(null);
  const [stage, setStage] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [opacity, setOpacity] = useState(.28);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [stream, setStream] = useState<"all" | CorticalStream>("all");
  const settings = useRef({ stage, playing, opacity, speed, stream });
  settings.current = { stage, playing, opacity, speed, stream };

  useEffect(() => {
    api.current?.redraw();
  }, [stage, opacity, playing, stream]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    } catch {
      setError(true);
      return;
    }
    let disposed = false;
    let frame = 0;
    let previous = 0;
    let phase = 0;
    let previousStage = 0;
    let visible = true;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(37, 1, .5, 2000);
    const center = new THREE.Vector3(0, 10, 10);
    camera.position.set(-220, 105, -265);
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.copy(center);
    orbit.enablePan = false;
    orbit.minDistance = 180;
    orbit.maxDistance = 650;
    orbit.update();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute("aria-label", `Rotatable 3D cortical brain surface and ${mode} pathway`);
    renderer.domElement.setAttribute("role", "img");
    element.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x796b87, 2.5));
    const keyLight = new THREE.DirectionalLight(0xfff0e7, 3.8);
    keyLight.position.set(-120, 160, -170);
    scene.add(keyLight);
    const rim = new THREE.DirectionalLight(0xb6a0d1, 2.5);
    rim.position.set(130, 90, 100);
    scene.add(rim);

    const cortexMaterial = new THREE.MeshStandardMaterial({
      color: 0xc2a7ad, roughness: .78, metalness: 0, transparent: true,
      opacity: settings.current.opacity, depthWrite: false, side: THREE.FrontSide,
    });
    const pathColor = new THREE.Color(data.color);
    const baseMaterial = new THREE.MeshBasicMaterial({ color: pathColor, transparent: true, opacity: .24, depthTest: false });
    const activeMaterial = new THREE.MeshBasicMaterial({ color: pathColor, depthTest: false });
    const streamMaterials = Object.fromEntries((["ventral", "dorsal"] as const).map((name) => [
      name, {
        base: new THREE.MeshBasicMaterial({ color: streamColors[name], transparent: true, opacity: .45, depthTest: false }),
        active: new THREE.MeshBasicMaterial({ color: streamColors[name], depthTest: false }),
      },
    ])) as Record<CorticalStream, { base: THREE.MeshBasicMaterial; active: THREE.MeshBasicMaterial }>;
    const lightMaterial = new THREE.MeshBasicMaterial({ color: 0xf9cf76, depthTest: false });
    const pulseGeometry = new THREE.SphereGeometry(1.9, 12, 8);

    const nodes = data.steps.flatMap((step, stepIndex) => step.points.map((point) => {
      const material = new THREE.MeshBasicMaterial({ color: step.stream ? streamColors[step.stream] : pathColor, transparent: true, opacity: .4, depthTest: false });
      const node = new THREE.Mesh(new THREE.SphereGeometry(stepIndex >= 6 ? 3.5 : 2.5, 18, 12), material);
      node.position.fromArray(point);
      node.renderOrder = 3;
      scene.add(node);
      return { node, step: stepIndex, stream: step.stream };
    }));

    const edges = data.routes.map((route) => {
      const curve = new THREE.CatmullRomCurve3(route.points.map((point) => new THREE.Vector3(...point)), false, "centripetal");
      const line = new THREE.Mesh(new THREE.TubeGeometry(curve, 36, .8, 6, false), baseMaterial);
      line.renderOrder = 2;
      scene.add(line);
      const pulse = new THREE.Mesh(pulseGeometry, lightMaterial);
      pulse.renderOrder = 5;
      scene.add(pulse);
      return { line, pulse, curve, stage: route.stage, stream: route.stream };
    });
    const reticle = new THREE.Mesh(new THREE.SphereGeometry(5.4, 20, 12),
      new THREE.MeshBasicMaterial({ color: pathColor, wireframe: true, transparent: true, opacity: .6, depthTest: false }));
    reticle.renderOrder = 4;
    scene.add(reticle);

    const projected = new THREE.Vector3();
    function render() {
      if (disposed) return;
      const current = settings.current;
      cortexMaterial.opacity = current.opacity;
      for (const { node, step: nodeStage, stream: nodeStream } of nodes) {
        node.visible = !nodeStream || current.stream === "all" || current.stream === nodeStream;
        node.material.opacity = nodeStage === current.stage ? 1 : .35;
        node.scale.setScalar(nodeStage === current.stage ? 1.25 : 1);
      }
      for (const edge of edges) {
        const materials = edge.stream ? streamMaterials[edge.stream] : { active: activeMaterial, base: baseMaterial };
        edge.line.visible = !edge.stream || current.stream === "all" || current.stream === edge.stream;
        edge.line.material = edge.stage === current.stage ? materials.active : materials.base;
        edge.pulse.visible = edge.line.visible && current.playing && edge.stage === current.stage;
        if (edge.pulse.visible) edge.pulse.position.copy(edge.curve.getPoint(phase));
      }
      const focus = data.steps[current.stage].points[0];
      const focusStream = data.steps[current.stage].stream;
      reticle.material.color.set(focusStream ? streamColors[focusStream] : pathColor);
      reticle.position.fromArray(focus);
      if (markerLabel.current) {
        projected.copy(reticle.position).project(camera);
        const width = renderer.domElement.clientWidth;
        const height = renderer.domElement.clientHeight;
        markerLabel.current.style.left = `${Math.max(10, Math.min(width - 160, (projected.x + 1) * width / 2 + 10))}px`;
        markerLabel.current.style.top = `${Math.max(10, Math.min(height - 45, (1 - projected.y) * height / 2 - 28))}px`;
        markerLabel.current.hidden = projected.z > 1;
      }
      renderer.render(scene, camera);
    }

    function animate(now: number) {
      if (disposed) return;
      frame = requestAnimationFrame(animate);
      const elapsed = previous ? Math.min((now - previous) / 1000, .1) : 0;
      previous = now;
      if (!settings.current.playing || document.hidden || !visible) return;
      if (settings.current.stage !== previousStage) {
        previousStage = settings.current.stage;
        phase = 0;
      }
      phase += elapsed * settings.current.speed / 1.6;
      if (phase >= 1) {
        phase = 0;
        const allowed = data.steps.map((step, index) => ({ step, index })).filter(({ step }) =>
          !step.stream || settings.current.stream === "all" || step.stream === settings.current.stream,
        );
        const next = allowed[(allowed.findIndex(({ index }) => index === settings.current.stage) + 1) % allowed.length].index;
        settings.current = { ...settings.current, stage: next };
        previousStage = next;
        setStage(next);
      }
      render();
    }
    frame = requestAnimationFrame(animate);
    orbit.addEventListener("change", render);
    function resize() {
      if (disposed) return;
      const width = element!.clientWidth, height = element!.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      render();
    }
    const sizeObserver = new ResizeObserver(resize);
    sizeObserver.observe(element);
    const visibilityObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    visibilityObserver.observe(element);
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    function contextLost(event: Event) {
      event.preventDefault();
      setPlaying(false);
      setError(true);
    }
    const loader = new GLTFLoader();
    loader.load(brainUrl, (gltf) => {
      if (disposed) {
        gltf.scene.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.geometry.dispose();
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
        });
        return;
      }
      gltf.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.computeVertexNormals();
        const original = object.material;
        if (Array.isArray(original)) original.forEach((material) => material.dispose());
        else original.dispose();
        object.material = cortexMaterial;
      });
      scene.add(gltf.scene);
      setLoaded(true);
      render();
    }, undefined, () => { if (!disposed) setError(true); });

    api.current = {
      redraw: render,
      view(preset) {
        const positions: Record<string, [number, number, number]> = {
          oblique: [-220, 105, -265], front: [0, 25, -350], side: [-350, 30, 10], top: [0, 370, 10],
        };
        camera.up.set(0, 1, 0);
        if (preset === "top") camera.up.set(0, 0, -1);
        camera.position.fromArray(positions[preset] ?? positions.oblique);
        orbit.target.copy(center);
        orbit.update();
        render();
      },
    };
    resize();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      sizeObserver.disconnect();
      visibilityObserver.disconnect();
      orbit.dispose();
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      cortexMaterial.dispose();
      activeMaterial.dispose();
      baseMaterial.dispose();
      Object.values(streamMaterials).forEach(({ base, active }) => { base.dispose(); active.dispose(); });
      renderer.dispose();
      renderer.domElement.remove();
      api.current = null;
    };
  }, [data, mode]);

  function chooseStage(index: number) {
    setPlaying(false);
    setStage(index);
  }

  function chooseStream(next: "all" | CorticalStream) {
    setPlaying(false);
    setStream(next);
    setStage(next === "all" ? 0 : data.steps.findIndex((step) => step.stream === next));
  }

  return <section className="pathway-viewer" aria-label={data.title}>
    <div className="pathway-heading">
      <div><p className="eyebrow">Inside the brain</p><h2>{data.title}</h2></div>
      <button className="button secondary" type="button" disabled={!loaded || error} aria-pressed={playing}
        onClick={() => setPlaying(!playing)}>{playing ? "Pause signals" : "Animate signals"}</button>
    </div>
    <div className="pathway-streams" role="group" aria-label="Cortical stream focus">
      <button type="button" aria-pressed={stream === "all"} onClick={() => chooseStream("all")}>Both streams</button>
      <button type="button" className="stream-ventral" aria-pressed={stream === "ventral"} onClick={() => chooseStream("ventral")}>Ventral stream</button>
      <button type="button" className="stream-dorsal" aria-pressed={stream === "dorsal"} onClick={() => chooseStream("dorsal")}>Dorsal stream</button>
    </div>
    <div className="pathway-layout">
      <div>
        <div ref={host} className="brain-canvas">
          {!loaded && !error && <p className="brain-status" role="status">Loading the cortical surface…</p>}
          {error && <p className="brain-status" role="status">The 3D view is unavailable in this browser. Explore the pathway using the steps alongside it.</p>}
          <div className="brain-node-label" ref={markerLabel} hidden={error}>{data.steps[stage].name}</div>
        </div>
        <div className="brain-toolbar">
          <div className="brain-views" role="group" aria-label="Brain viewpoint">
            {["Oblique", "Front", "Side", "Top"].map((name) => <button type="button" key={name} disabled={error}
              onClick={() => api.current?.view(name.toLowerCase())}>{name}</button>)}
          </div>
          <label>Cortex opacity<input type="range" min=".08" max=".65" step=".01" value={opacity}
            onChange={(event) => setOpacity(event.currentTarget.valueAsNumber)} /></label>
          <label>Animation speed<select value={speed} onChange={(event) => setSpeed(Number(event.currentTarget.value))}>
            <option value=".5">0.5×</option><option value="1">1×</option><option value="1.5">1.5×</option>
          </select></label>
        </div>
        <p className="note">Drag to rotate. Scroll or pinch to zoom. View buttons also work with the keyboard.</p>
      </div>
      <div className="pathway-steps">
        <ol aria-label="Pathway stages">{data.steps.map((step, index) => (
          !step.stream || stream === "all" || step.stream === stream
        ) && <li key={step.name} className={step.stream ? `stream-${step.stream}` : undefined}>
          <button type="button" aria-current={stage === index ? "step" : undefined} onClick={() => chooseStage(index)}>
            <span className="pathway-step-dot" aria-hidden="true">{index+1}</span>{step.name}
          </button>
        </li>)}</ol>
        <div className="pathway-explanation"><h3>{data.steps[stage].name}</h3><p>{data.steps[stage].description}</p></div>
      </div>
    </div>
    <p className="note pathway-context">MRI-derived cortical template. Relay markers and routes show approximate locations and simplified connections. The animation illustrates signal direction on an expanded timescale. {data.note}</p>
    <p className="note pathway-sources"><a href={data.source}>{data.sourceTitle}</a> · <a href={data.cortexSource}>{data.cortexSourceTitle}</a>
      {"speechSource" in data && <> · <a href={data.speechSource}>Speech processing streams</a></>}
      {" · "}<a href="./brain/provenance.json">Brain surface credits</a> · <a href="./brain/LICENSE.txt">Surface license</a></p>
  </section>;
}

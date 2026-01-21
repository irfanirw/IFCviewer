import * as OBC from "@thatopen/components";
import * as FRAGS from "@thatopen/fragments";
import * as THREE from "three";

const viewer = document.getElementById("viewer");
const statusEl = document.getElementById("status");
const fileInput = document.getElementById("ifc-input");
const resetButton = document.getElementById("reset-camera");
const debugSchema = document.getElementById("debug-schema");
const debugModel = document.getElementById("debug-model");
const debugError = document.getElementById("debug-error");
const propertiesPanel = document.getElementById("properties-panel");
const propertiesTitle = document.getElementById("properties-title");
const propertiesContent = document.getElementById("properties-content");
const propertiesClear = document.getElementById("properties-clear");

const setStatus = (text) => {
  if (statusEl) {
    statusEl.textContent = text;
    statusEl.classList.remove("status--error");
  }
};

const showError = (text) => {
  if (statusEl) {
    statusEl.textContent = text;
    statusEl.classList.add("status--error");
  }
  if (debugError) debugError.textContent = text;
};

const setPropertiesMessage = (text) => {
  if (propertiesContent) propertiesContent.textContent = text;
  if (propertiesTitle) propertiesTitle.textContent = "IFC Properties";
};

const inferSchema = (buffer) => {
  const sample = new TextDecoder("utf-8", { fatal: false })
    .decode(buffer.slice(0, 4096))
    .toUpperCase();
  if (sample.includes("IFC4X3")) return "IFC4X3";
  if (sample.includes("IFC4")) return "IFC4";
  if (sample.includes("IFC2X3")) return "IFC2X3";
  return "UNKNOWN";
};

const categoryPalette = [
  "#e76f51",
  "#f4a261",
  "#e9c46a",
  "#2a9d8f",
  "#264653",
  "#5a4fcf",
  "#3a86ff",
  "#219ebc",
  "#8ecae6",
  "#ffb703",
  "#fb8500",
  "#ef476f",
  "#06d6a0",
  "#118ab2",
  "#073b4c",
];

const hashString = (value) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const colorForCategory = (category) => {
  const index = hashString(category) % categoryPalette.length;
  return categoryPalette[index];
};

const fitCameraToModel = (camera, model) => {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxDim) || maxDim === 0) return;
  const distance = maxDim * 1.5;
  camera.controls.setLookAt(
    center.x + distance,
    center.y + distance,
    center.z + distance,
    center.x,
    center.y,
    center.z
  );
};

const boot = async () => {
  if (!viewer) {
    showError("Viewer container not found.");
    return;
  }

  setStatus("Booting viewer...");
  if (debugModel) debugModel.textContent = "booting";

  const components = new OBC.Components();
  const worlds = components.get(OBC.Worlds);
  const world = worlds.create(
    OBC.SimpleScene,
    OBC.OrthoPerspectiveCamera,
    OBC.SimpleRenderer
  );

  world.scene = new OBC.SimpleScene(components);
  world.scene.setup();
  world.scene.config.backgroundColor = new THREE.Color("#f4f7fb");

  world.renderer = new OBC.SimpleRenderer(components, viewer);
  world.camera = new OBC.OrthoPerspectiveCamera(components);
  await world.camera.controls.setLookAt(12, 12, 12, 0, 0, 0);

  components.init();
  components.get(OBC.Grids).create(world);

  const fragments = components.get(OBC.FragmentsManager);
  const workerUrl = "/worker.mjs";
  fragments.init(workerUrl);

  world.camera.controls.addEventListener("rest", () => {
    fragments.core.update(true);
  });

  fragments.list.onItemSet.add(({ value: model }) => {
    model.useCamera(world.camera.three);
    world.scene.three.add(model.object);
    fragments.core.update(true);
    fitCameraToModel(world.camera, model.object);
    void (async () => {
      try {
        const categories = await model.getCategories();
        for (const category of categories) {
          const regex = new RegExp(`^${category}$`);
          const items = await model.getItemsOfCategories([regex]);
          const localIds = Object.values(items).flat();
          if (localIds.length === 0) continue;
          await model.highlight(localIds, {
            customId: `category-${category}`,
            color: new THREE.Color(colorForCategory(category)),
            renderedFaces: FRAGS.RenderedFaces.ALL,
            opacity: 1,
            transparent: false,
          });
        }
        await fragments.core.update(true);
      } catch (error) {
        showError(`Failed to colorize categories: ${error.message || error}`);
      }
    })();
  });

  const raycaster = components.get(OBC.Raycasters).get(world);

  const showPropertiesForHit = async (hit) => {
    if (!hit || hit.localId === undefined || !hit.fragments) {
      setPropertiesMessage("No element selected.");
      return;
    }
    const model = hit.fragments;
    const localId = hit.localId;
    let guid = null;
    let category = null;
    let data = null;

    if (typeof model.getGuidsByLocalIds === "function") {
      [guid] = await model.getGuidsByLocalIds([localId]);
    }

    if (typeof model.getItemsCategories === "function") {
      [category] = await model.getItemsCategories([localId]);
    }

    if (typeof model.getItemsData === "function") {
      [data] = await model.getItemsData([localId]);
    } else if (typeof model.getItem === "function") {
      const item = model.getItem(localId);
      if (!guid && typeof item.getGuid === "function") {
        guid = await item.getGuid();
      }
      if (!category && typeof item.getCategory === "function") {
        category = await item.getCategory();
      }
      if (typeof item.getData === "function") {
        data = await item.getData();
      }
    }

    if (!data) {
      data = { localId };
    }
    if (propertiesTitle) {
      const label = category ? category : "IFC Element";
      propertiesTitle.textContent = guid ? `${label} • ${guid}` : label;
    }
    if (propertiesContent) {
      propertiesContent.textContent = JSON.stringify(data ?? {}, null, 2);
    }
  };

  const ifcLoader = components.get(OBC.IfcLoader);
  await ifcLoader.setup({
    autoSetWasm: false,
    wasm: {
      path: "/web-ifc/",
      absolute: true,
    },
  });

  const loadIfcFromFile = async (file) => {
    if (debugError) debugError.textContent = "-";
    if (statusEl) statusEl.classList.remove("status--error");
    if (debugModel) debugModel.textContent = "loading";
    const buffer = await file.arrayBuffer();
    const schema = inferSchema(buffer);
    if (debugSchema) debugSchema.textContent = schema;
    setStatus(`Loading ${file.name} (${schema})...`);
    const data = new Uint8Array(buffer);
    await ifcLoader.load(data, false, file.name, {
      processData: {
        progressCallback: (progress) => {
          setStatus(`Loading ${file.name} (${schema}) ${Math.round(progress)}%`);
        },
      },
    });
    if (debugModel) debugModel.textContent = "loaded";
    setStatus(`Loaded ${file.name} (${schema}).`);
  };

  fileInput?.addEventListener("change", (event) => {
    const [file] = event.target.files || [];
    if (file) loadIfcFromFile(file).catch((error) => showError(error.message || error));
  });

  resetButton?.addEventListener("click", () => {
    world.camera.controls.setLookAt(12, 12, 12, 0, 0, 0);
  });

  const handleDrop = (event) => {
    event.preventDefault();
    const [file] = event.dataTransfer.files || [];
    if (!file) return;
    loadIfcFromFile(file).catch((error) => showError(error.message || error));
  };

  viewer.addEventListener("dragover", (event) => {
    event.preventDefault();
    viewer.classList.add("viewer--drag");
  });

  viewer.addEventListener("dragleave", () => {
    viewer.classList.remove("viewer--drag");
  });

  viewer.addEventListener("drop", (event) => {
    viewer.classList.remove("viewer--drag");
    handleDrop(event);
  });

  viewer.addEventListener("click", async () => {
    try {
      const hit = await raycaster.castRay();
      await showPropertiesForHit(hit);
    } catch (error) {
      showError(`Pick error: ${error.message || error}`);
    }
  });

  propertiesClear?.addEventListener("click", () => {
    setPropertiesMessage("Click an element to view properties.");
  });

  window.addEventListener("error", (event) => {
    showError(`Runtime error: ${event.message || event.error}`);
  });

  window.addEventListener("unhandledrejection", (event) => {
    showError(`Promise rejected: ${event.reason?.message || event.reason}`);
  });

  setStatus("Ready. Drop an IFC file to start.");
  if (debugModel) debugModel.textContent = "idle";
  if (!propertiesPanel) {
    setPropertiesMessage("Click an element to view properties.");
  }
};

boot().catch((error) => showError(error.message || error));

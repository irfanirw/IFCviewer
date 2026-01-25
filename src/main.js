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
const propertiesToggle = document.getElementById("properties-toggle");
const propertiesShow = document.getElementById("properties-show");
const objectTreePanel = document.getElementById("objecttree-panel");
const objectTreeTitle = document.getElementById("objecttree-title");
const objectTreeContent = document.getElementById("objecttree-content");
const objectTreeCollapse = document.getElementById("objecttree-collapse");
const objectTreeToggle = document.getElementById("objecttree-toggle");
const objectTreeShow = document.getElementById("objecttree-show");
const loadingBar = document.getElementById("loading-bar");
const loadingPercentage = document.getElementById("loading-percentage");
const loadingProgress = document.getElementById("loading-progress");
const logPanel = document.getElementById("log-panel");
const logContent = document.getElementById("log-content");
const logClear = document.getElementById("log-clear");
const axisHelperContainer = document.getElementById("axis-helper");

// Store current model globally
let currentModel = null;
let currentHighlightedItem = null; // Track currently highlighted item
let fragmentsManager = null; // Store fragments manager globally
let isLoadingIfc = false;
let loadToken = 0;

const appendLogEntry = (message, level = "info") => {
  if (!logContent) return;
  const entry = document.createElement("div");
  entry.className = "log-entry";
  entry.dataset.level = level;
  const time = document.createElement("time");
  const now = new Date();
  time.textContent = now.toLocaleTimeString();
  const text = document.createElement("span");
  text.textContent = message;
  entry.appendChild(time);
  entry.appendChild(text);
  logContent.appendChild(entry);
  logContent.scrollTop = logContent.scrollHeight;
};

const logInfo = (message) => appendLogEntry(message, "info");
const logWarn = (message) => appendLogEntry(message, "warn");
const logError = (message) => appendLogEntry(message, "error");

const disposeMaterial = (material) => {
  if (!material) return;
  if (Array.isArray(material)) {
    material.forEach(disposeMaterial);
    return;
  }
  if (material.map) material.map.dispose?.();
  if (material.lightMap) material.lightMap.dispose?.();
  if (material.aoMap) material.aoMap.dispose?.();
  if (material.emissiveMap) material.emissiveMap.dispose?.();
  if (material.bumpMap) material.bumpMap.dispose?.();
  if (material.normalMap) material.normalMap.dispose?.();
  if (material.displacementMap) material.displacementMap.dispose?.();
  if (material.roughnessMap) material.roughnessMap.dispose?.();
  if (material.metalnessMap) material.metalnessMap.dispose?.();
  if (material.alphaMap) material.alphaMap.dispose?.();
  if (material.envMap) material.envMap.dispose?.();
  material.dispose?.();
};

const disposeObject3D = (object) => {
  if (!object) return;
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose?.();
    if (child.material) disposeMaterial(child.material);
  });
};

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
  logError(text);
};

const setPropertiesMessage = (text) => {
  if (propertiesContent) {
    propertiesContent.innerHTML = `<p class="properties-message">${text}</p>`;
  }
  if (propertiesTitle) propertiesTitle.textContent = "IFC Properties";
};

const showLoadingBar = () => {
  if (loadingBar) {
    loadingBar.style.display = "block";
  }
};

const hideLoadingBar = () => {
  if (loadingBar) {
    loadingBar.style.display = "none";
  }
  if (loadingPercentage) loadingPercentage.textContent = "0%";
  if (loadingProgress) loadingProgress.style.width = "0%";
};

const normalizeProgress = (progress) => {
  const value = progress <= 1 ? progress * 100 : progress;
  return Math.min(100, Math.max(0, value));
};

const updateLoadingProgress = (progress) => {
  const percentage = Math.round(normalizeProgress(progress));
  if (loadingPercentage) {
    loadingPercentage.textContent = `${percentage}%`;
  }
  if (loadingProgress) {
    loadingProgress.style.width = `${percentage}%`;
  }
};

const formatPropertyKey = (key) => {
  // Handle special cases first
  if (key === '_category.value' || key === '_category') {
    return 'Category';
  }
  if (key === '_guid.value' || key === '_guid') {
    return 'GUID';
  }

  // If key ends with .value, remove it and return the part before
  if (key.endsWith('.value')) {
    key = key.slice(0, -6); // Remove '.value'
  }

  // If key ends with .type, just return 'type'
  if (key.endsWith('.type')) {
    return 'type';
  }

  // Remove leading underscore if present
  if (key.startsWith('_')) {
    key = key.slice(1);
  }

  // Capitalize first letter of each word after dots
  return key.split('.').map(part =>
    part.charAt(0).toUpperCase() + part.slice(1)
  ).join('.');
};

const createPropertiesTable = (data) => {
  const flattenObject = (obj, prefix = '') => {
    const flattened = {};
    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}.${key}` : key;
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(flattened, flattenObject(value, newKey));
      } else if (Array.isArray(value)) {
        flattened[newKey] = JSON.stringify(value);
      } else {
        flattened[newKey] = value;
      }
    }
    return flattened;
  };

  const flattened = flattenObject(data);

  const table = document.createElement('table');
  table.className = 'properties-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const keyHeader = document.createElement('th');
  keyHeader.textContent = 'Key';
  const valueHeader = document.createElement('th');
  valueHeader.textContent = 'Value';
  headerRow.appendChild(keyHeader);
  headerRow.appendChild(valueHeader);
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const [key, value] of Object.entries(flattened)) {
    const row = document.createElement('tr');

    const keyCell = document.createElement('td');
    keyCell.className = 'properties-table-key';
    keyCell.textContent = formatPropertyKey(key);

    const valueCell = document.createElement('td');
    valueCell.className = 'properties-table-value';
    valueCell.textContent = value !== null && value !== undefined ? String(value) : '-';

    row.appendChild(keyCell);
    row.appendChild(valueCell);
    tbody.appendChild(row);
  }
  table.appendChild(tbody);

  return table;
};

const reapplyCategoryHighlights = async (model) => {
  // Reapply light grey color instead of category colors
  if (!model || typeof model.getAllIds !== "function" || typeof model.highlight !== "function") return;

  try {
    const allIds = await model.getAllIds();
    if (allIds.length === 0) return;

    await model.highlight(allIds, {
      customId: "default-grey",
      color: new THREE.Color("#FFFFFF"), // white
      renderedFaces: FRAGS.RenderedFaces.ALL,
      opacity: 1,
      transparent: false,
    });
  } catch (e) {
    console.warn("Failed to reapply default color:", e);
  }
};

const colorizeCategories = async (model) => {
  // Category colors deactivated - apply light grey to all objects
  if (!model || typeof model.getAllIds !== "function" || typeof model.highlight !== "function") return;

  try {
    const allIds = await model.getAllIds();
    if (allIds.length === 0) return;

    await model.highlight(allIds, {
      customId: "default-grey",
      color: new THREE.Color("#FFFFFF"), // white
      renderedFaces: FRAGS.RenderedFaces.ALL,
      opacity: 1,
      transparent: false,
    });
  } catch (error) {
    console.error(`Failed to apply default color: ${error.message || error}`);
  }
};

const selectionRenderedFaces =
  FRAGS.RenderedFaces?.ONE ??
  FRAGS.RenderedFaces?.EDGES ??
  FRAGS.RenderedFaces?.ALL;

const selectionFillId = "selected-item-fill";
const selectionWireId = "selected-item-wire";
const selectionFillColor = new THREE.Color("#87CEEB");
const selectionWireColor = new THREE.Color("#1d3557");

const clearSelectionHighlight = async () => {
  if (!currentHighlightedItem || !currentHighlightedItem.model) return;

  const { model, localId } = currentHighlightedItem;

  try {
    // Clear the selection highlights
    if (typeof model.clearHighlight === "function") {
      try {
        await model.clearHighlight(selectionFillId);
        await model.clearHighlight(selectionWireId);
      } catch (e) {
        await model.clearHighlight();
      }
    }
    if (typeof model.removeHighlight === "function") {
      try {
        await model.removeHighlight([localId], selectionFillId);
        await model.removeHighlight([localId], selectionWireId);
      } catch (e) {
        await model.removeHighlight([localId]);
      }
    }

    // Reapply grey color to the previously selected item
    if (typeof model.highlight === "function") {
      try {
        // Reapply white to the deselected item
        await model.highlight([localId], {
          customId: "default-grey",
          color: new THREE.Color("#FFFFFF"),
          renderedFaces: FRAGS.RenderedFaces.ALL,
          opacity: 1,
          transparent: false,
        });
      } catch (e) {
        console.warn("Failed to reapply default appearance to deselected item:", e);
      }
    }
  } catch (e) {
    console.warn("Failed to clear previous highlight:", e);
  }

  currentHighlightedItem = null;

  if (fragmentsManager && fragmentsManager.core) {
    await fragmentsManager.core.update(true);
  }
};

const highlightSelectedItem = async (model, localId, category = null) => {
  await clearSelectionHighlight();

  if (!model || localId === undefined || typeof model.highlight !== "function") return;

  try {
    // Remove default grey from selected item
    if (typeof model.removeHighlight === "function") {
      try {
        await model.removeHighlight([localId], "default-grey");
      } catch (removeError) {
        // Ignore if removal fails
      }
    }

    // Apply fill highlight with emissive properties
    await model.highlight([localId], {
      customId: selectionFillId,
      color: selectionFillColor,
      emissive: selectionFillColor,
      emissiveIntensity: 3,
      renderedFaces: FRAGS.RenderedFaces.ALL,
      opacity: 1,
      transparent: false,
      depthTest: true,
      depthWrite: true,
    });

    // Solid light blue selection
    currentHighlightedItem = { model, localId, category };

    if (fragmentsManager && fragmentsManager.core) {
      await fragmentsManager.core.update(true);
    }
  } catch (e) {
    console.warn("Failed to highlight item:", e);
  }
};

const setObjectTreeMessage = (text) => {
  if (objectTreeContent) {
    objectTreeContent.innerHTML = `<p class="objecttree-message">${text}</p>`;
  }
};

const createTreeNode = (label, children = [], icon = "📦", count = 0, data = {}) => {
  const li = document.createElement("li");
  li.className = "tree-item";

  const header = document.createElement("div");
  header.className = "tree-item-header";

  // Don't store model in data, use global reference instead
  if (data.model) {
    delete data.model;
  }
  header.dataset.nodeData = JSON.stringify(data);

  const expandIcon = document.createElement("span");
  expandIcon.className = `tree-expand-icon ${children.length === 0 ? 'empty' : ''}`;
  expandIcon.textContent = "▶";

  const itemIcon = document.createElement("span");
  itemIcon.className = "tree-item-icon";
  itemIcon.textContent = icon;

  const itemLabel = document.createElement("span");
  itemLabel.className = "tree-item-label";
  itemLabel.textContent = label;

  header.appendChild(expandIcon);
  header.appendChild(itemIcon);
  header.appendChild(itemLabel);

  if (count > 0) {
    const itemCount = document.createElement("span");
    itemCount.className = "tree-item-count";
    itemCount.textContent = count;
    header.appendChild(itemCount);
  }

  li.appendChild(header);

  if (children.length > 0) {
    const childrenUl = document.createElement("ul");
    childrenUl.className = "tree-children collapsed";
    children.forEach(child => childrenUl.appendChild(child));
    li.appendChild(childrenUl);

    header.addEventListener("click", (e) => {
      e.stopPropagation();
      const isExpanded = expandIcon.classList.contains("expanded");
      expandIcon.classList.toggle("expanded");
      childrenUl.classList.toggle("collapsed");

      if (!isExpanded) {
        childrenUl.style.maxHeight = childrenUl.scrollHeight + "px";
      } else {
        childrenUl.style.maxHeight = "0";
      }

      // Also handle item selection for category nodes with data
      const parsedData = JSON.parse(header.dataset.nodeData);
      if (parsedData.localId !== undefined && currentModel) {
        selectTreeItem(header);
        showPropertiesForTreeNode({ ...parsedData, model: currentModel }).catch(err => console.error(err));
      }
    });
  } else {
    // Leaf nodes without children
    const parsedData = JSON.parse(header.dataset.nodeData);
    if (parsedData.localId !== undefined) {
      header.addEventListener("click", (e) => {
        e.stopPropagation();
        selectTreeItem(header);
        showPropertiesForTreeNode({ ...parsedData, model: currentModel }).catch(err => console.error(err));
      });
    }
  }

  return li;
};

const selectTreeItem = (header) => {
  // Remove previous selection
  if (objectTreeContent) {
    const previousSelected = objectTreeContent.querySelector(".tree-item-header.selected");
    if (previousSelected) {
      previousSelected.classList.remove("selected");
    }
  }
  // Add new selection
  header.classList.add("selected");
};

const showPropertiesForTreeNode = async (data) => {
  if (!data.model || data.localId === undefined) return;

  const model = data.model;
  const localId = data.localId;
  let guid = null;
  let category = data.category || null;
  let propData = null;

  // Try to get GUID
  if (typeof model.getGuidsByLocalIds === "function") {
    try {
      [guid] = await model.getGuidsByLocalIds([localId]);
    } catch (e) {
      console.warn("Could not fetch GUID:", e);
    }
  }

  // Try to get item data
  if (typeof model.getItemsData === "function") {
    try {
      [propData] = await model.getItemsData([localId]);
    } catch (e) {
      console.warn("Could not fetch item data:", e);
    }
  }

  if (!propData) {
    propData = { localId };
  }

  // Highlight the selected item in light blue
  await highlightSelectedItem(model, localId, category);

  // Keep title as "IFC Properties" - don't change it
  // The category and GUID info can be shown in the table itself

  if (propertiesContent) {
    propertiesContent.innerHTML = '';
    const table = createPropertiesTable(propData ?? {});
    propertiesContent.appendChild(table);
  }
};

const getLatestModelFromList = () => {
  if (!fragmentsManager?.list) return null;
  if (typeof fragmentsManager.list.values === "function") {
    const values = Array.from(fragmentsManager.list.values());
    return values[values.length - 1] ?? null;
  }
  if (fragmentsManager.list.ids && typeof fragmentsManager.list.get === "function") {
    const ids = Array.from(fragmentsManager.list.ids);
    const lastId = ids[ids.length - 1];
    return lastId !== undefined ? fragmentsManager.list.get(lastId) : null;
  }
  return null;
};

const resolveModelForTree = (model) => {
  const latest = getLatestModelFromList();
  if (!latest) return model;
  if (!model) return latest;
  if (model === latest) return model;

  const candidate = [model?.name, model?.id, model?.modelID, model?.uuid].find(Boolean);
  if (!candidate) return latest;

  const values = typeof fragmentsManager.list.values === "function"
    ? Array.from(fragmentsManager.list.values())
    : [];
  const match = values.find((entry) =>
    entry === model ||
    entry?.name === candidate ||
    entry?.id === candidate ||
    entry?.modelID === candidate ||
    entry?.uuid === candidate
  );
  return match || latest;
};

const buildObjectTree = async (model) => {
  const attemptBuild = async () => {
    setObjectTreeMessage("Building tree...");

    const resolvedModel = resolveModelForTree(model);
    if (resolvedModel && resolvedModel !== currentModel) {
      currentModel = resolvedModel;
    }

    if (!resolvedModel) {
      throw new Error("Model not available for object tree.");
    }

    const categories = await resolvedModel.getCategories();
    const rootNodes = [];

    for (const category of categories) {
      const regex = new RegExp(`^${category}$`);
      const items = await resolvedModel.getItemsOfCategories([regex]);
      const localIds = Object.values(items).flat();

      if (localIds.length === 0) continue;

      const childNodes = [];

      // Create child nodes for individual elements (limit to first 50 for performance)
      const displayLimit = Math.min(localIds.length, 50);
      for (let i = 0; i < displayLimit; i++) {
        const localId = localIds[i];

        // Don't fetch GUID here, do it on click to avoid errors
        const childNode = createTreeNode(
          `${category} [${localId}]`,
          [],
          "📄",
          0,
          { localId, category }
        );
        childNodes.push(childNode);
      }

      if (localIds.length > displayLimit) {
        const moreNode = createTreeNode(
          `... ${localIds.length - displayLimit} more items`,
          [],
          "⋯",
          0,
          {}
        );
        childNodes.push(moreNode);
      }

      const categoryNode = createTreeNode(
        category,
        childNodes,
        "📁",
        localIds.length,
        { category, localIds }
      );

      rootNodes.push(categoryNode);
    }

    if (rootNodes.length === 0) {
      setObjectTreeMessage("No objects found in model.");
      return;
    }

    const rootUl = document.createElement("ul");
    rootUl.className = "tree-node";
    rootNodes.forEach(node => rootUl.appendChild(node));

    if (objectTreeContent) {
      objectTreeContent.innerHTML = "";
      objectTreeContent.appendChild(rootUl);
    }
  };

  try {
    await attemptBuild();
  } catch (error) {
    const message = error?.message || String(error);
    if (message.includes("Model not found")) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      try {
        await attemptBuild();
        return;
      } catch (retryError) {
        setObjectTreeMessage(`Error building tree: ${retryError.message || retryError}`);
        return;
      }
    }
    setObjectTreeMessage(`Error building tree: ${message}`);
  }
};

const collapseAllTreeNodes = () => {
  if (!objectTreeContent) return;

  const allExpanded = objectTreeContent.querySelectorAll(".tree-expand-icon.expanded");
  allExpanded.forEach(icon => {
    icon.classList.remove("expanded");
    const header = icon.closest(".tree-item-header");
    const item = header.closest(".tree-item");
    const children = item.querySelector(".tree-children");
    if (children) {
      children.classList.add("collapsed");
      children.style.maxHeight = "0";
    }
  });
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
  "#FFB3BA", // pastel red
  "#FFDFBA", // pastel orange
  "#FFFFBA", // pastel yellow
  "#BAFFC9", // pastel green
  "#BAE1FF", // pastel blue
  "#E7BAFF", // pastel purple
  "#FFBAF3", // pastel pink
  "#FFD4BA", // pastel peach
  "#C9BAFF", // pastel lavender
  "#BAFFF0", // pastel mint
  "#FFE5BA", // pastel cream
  "#FFBAD4", // pastel rose
  "#BAFFE7", // pastel aqua
  "#D4BAFF", // pastel violet
  "#FFCCE5", // pastel magenta
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
  world.scene.config.backgroundColor = new THREE.Color("#1a1a1a");

  world.renderer = new OBC.SimpleRenderer(components, viewer);
  world.camera = new OBC.OrthoPerspectiveCamera(components);
  await world.camera.controls.setLookAt(12, 12, 12, 0, 0, 0);

  components.init();
  components.get(OBC.Grids).create(world);

  const fragments = components.get(OBC.FragmentsManager);
  fragmentsManager = fragments; // Store globally for highlighting
  const workerUrl = "/worker.mjs";
  fragments.init(workerUrl);

  world.camera.controls.addEventListener("rest", () => {
    fragments.core.update(true);
  });

  fragments.list.onItemSet.add(({ value: model }) => {
    logInfo("Model added to fragments list.");

    // Store the current model globally
    currentModel = model;

    model.useCamera(world.camera.three);
    world.scene.three.add(model.object);
    fragments.core.update(true);
    fitCameraToModel(world.camera, model.object);

    // Build object tree
    buildObjectTree(model).catch(error => {
      console.error("Failed to build object tree:", error);
      logWarn("Object tree build failed. Check console for details.");
    });

    void (async () => {
      if (typeof model.highlight !== "function") {
        console.warn("Model does not have highlight method, skipping colorization");
        logWarn("Model highlight not available; skipping colorization.");
        return;
      }

      await colorizeCategories(model);
      await fragments.core.update(true);
    })();
  });

  const raycaster = components.get(OBC.Raycasters).get(world);

  const showPropertiesForHit = async (hit) => {
    if (!hit || hit.localId === undefined || !hit.fragments) {
      // Clear highlight when clicking on empty space
      await clearSelectionHighlight();
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

    // Highlight the selected item in light blue
    await highlightSelectedItem(model, localId, category);

    // Keep title as "IFC Properties" - don't change it
    // The category and GUID info can be shown in the table itself

    if (propertiesContent) {
      propertiesContent.innerHTML = '';
      const table = createPropertiesTable(data ?? {});
      propertiesContent.appendChild(table);
    }
  };

  // Axis helper (small viewport in bottom-left)
  if (axisHelperContainer) {
    const axisScene = new THREE.Scene();
    const axisCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
    axisCamera.position.set(5, 5, 5);
    axisCamera.lookAt(0, 0, 0);

    const axisRenderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      precision: "lowp"
    });
    axisRenderer.setSize(
      axisHelperContainer.clientWidth || 100,
      axisHelperContainer.clientHeight || 100
    );
    axisRenderer.setPixelRatio(window.devicePixelRatio || 1);
    axisRenderer.setClearColor(0x000000, 0.1);
    axisRenderer.shadowMap.enabled = false;
    axisHelperContainer.appendChild(axisRenderer.domElement);

    const axesHelper = new THREE.AxesHelper(2);
    axisScene.add(axesHelper);

    const updateAxisHelper = () => {
      const mainCam = world.camera && world.camera.three ? world.camera.three : null;

      if (mainCam) {
        axesHelper.quaternion.copy(mainCam.quaternion);
      } else {
        axesHelper.quaternion.identity();
      }

      axisCamera.position.set(5, 5, 5);
      axisCamera.lookAt(0, 0, 0);

      const width = axisHelperContainer.clientWidth || 100;
      const height = axisHelperContainer.clientHeight || 100;
      const pixelRatio = window.devicePixelRatio || 1;
      const targetW = Math.max(1, Math.round(width * pixelRatio));
      const targetH = Math.max(1, Math.round(height * pixelRatio));

      if (
        axisRenderer.domElement.width !== targetW ||
        axisRenderer.domElement.height !== targetH
      ) {
        axisRenderer.setSize(width, height, false);
        axisCamera.aspect = width / height;
        axisCamera.updateProjectionMatrix();
      }

      axisRenderer.render(axisScene, axisCamera);
    };

    if (world.renderer && world.renderer.onAfterUpdate) {
      world.renderer.onAfterUpdate.add(updateAxisHelper);
    }

    updateAxisHelper();
  }

  const ifcLoader = components.get(OBC.IfcLoader);
  try {
    await ifcLoader.setup({
      autoSetWasm: false,
      wasm: {
        path: "/web-ifc/",
        absolute: true,
      },
      worker: {
        path: "/web-ifc/web-ifc-mt.worker.js",
        absolute: true,
      },
    });
    logInfo("IFC loader initialized.");
  } catch (error) {
    logError(`IFC loader setup failed: ${error.message || error}`);
    throw error;
  }

  const resetViewerForNewModel = async () => {
    await clearSelectionHighlight();

    // Clear all models from fragments list
    if (fragmentsManager?.list) {
      try {
        // Get all model IDs and remove them
        const modelIds = Array.from(fragmentsManager.list.ids || []);
        for (const modelId of modelIds) {
          const model = fragmentsManager.list.get(modelId);
          if (model?.object) {
            disposeObject3D(model.object);
            world.scene.three.remove(model.object);
          }
          if (typeof fragmentsManager.list.delete === "function") {
            fragmentsManager.list.delete(modelId);
          }
        }
      } catch (e) {
        console.warn("Failed to clear fragments list:", e);
      }
    }

    // Also remove current model if it exists
    if (currentModel?.object) {
      disposeObject3D(currentModel.object);
      world.scene.three.remove(currentModel.object);
      if (typeof currentModel.dispose === "function") {
        try {
          currentModel.dispose();
        } catch (e) {
          console.warn("Failed to dispose current model:", e);
        }
      }
    }

    currentModel = null;

    // Clear UI
    setObjectTreeMessage("No model loaded.");
    if (objectTreeContent) objectTreeContent.innerHTML = "";
    setPropertiesMessage("Click an element to view properties.");

    if (fragmentsManager?.core) {
      try {
        void fragmentsManager.core.update(true);
      } catch (error) {
        console.warn("Failed to update fragments core:", error);
      }
    }
  };

  const loadIfcFromFile = async (file) => {
    if (isLoadingIfc) return;
    isLoadingIfc = true;
    loadToken += 1;
    const currentToken = loadToken;
    if (debugError) debugError.textContent = "-";
    if (statusEl) statusEl.classList.remove("status--error");
    if (debugModel) debugModel.textContent = "loading";
    showLoadingBar();
    try {
      logInfo(`Loading ${file.name}...`);

      const withTimeout = (promise, timeoutMs, label) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(new Error(`${label} timed out.`));
          }, timeoutMs);
          promise
            .then((result) => {
              clearTimeout(timer);
              resolve(result);
            })
            .catch((error) => {
              clearTimeout(timer);
              reject(error);
            });
        });

      logInfo("Resetting viewer...");
      await withTimeout(resetViewerForNewModel(), 8000, "Reset");
      logInfo("Viewer reset complete.");

      const verifyResource = async (label, url) => {
        try {
          const response = await fetch(url, { method: "GET" });
          if (!response.ok) {
            logWarn(`${label} missing (${response.status}): ${url}`);
            return false;
          }
          logInfo(`${label} OK: ${url}`);
          return true;
        } catch (error) {
          logWarn(`${label} check failed: ${error.message || error}`);
          return false;
        }
      };

      logInfo("Checking IFC resources...");
      await verifyResource("web-ifc wasm", "/web-ifc/web-ifc.wasm");
      await verifyResource("web-ifc worker", "/web-ifc/web-ifc-mt.worker.js");

      logInfo("Reading IFC file...");
      const buffer = await withTimeout(file.arrayBuffer(), 10000, "File read");
      updateLoadingProgress(5);
      logInfo(`File read complete (${buffer.byteLength} bytes).`);

      const schema = inferSchema(buffer);
      if (debugSchema) debugSchema.textContent = schema;
      setStatus(`Loading ${file.name} (${schema})...`);

      const data = new Uint8Array(buffer);
      updateLoadingProgress(15);

      let lastProgress = 0;
      const progressTimeout = setTimeout(() => {
        if (lastProgress === 0) {
          setStatus(`Parsing ${file.name}...`);
          updateLoadingProgress(25);
        }
      }, 1500);

      const progressCallback = (progress) => {
        const normalized = normalizeProgress(progress);
        lastProgress = normalized;
        updateLoadingProgress(normalized);
        setStatus(`Loading ${file.name} (${schema}) ${Math.round(normalized)}%`);
      };

      const loadOptions = {
        processData: {
          progressCallback,
        },
      };

      const loadWithTimeout = (promise, timeoutMs, timeoutMessage) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(new Error(timeoutMessage));
          }, timeoutMs);
          promise
            .then((result) => {
              clearTimeout(timer);
              resolve(result);
            })
            .catch((error) => {
              clearTimeout(timer);
              reject(error);
            });
        });

      const waitForModelFromEvent = (timeoutMs) =>
        new Promise((resolve, reject) => {
          if (!fragmentsManager?.list?.onItemSet?.add) {
            resolve(null);
            return;
          }

          let settled = false;
          let timer;
          const handler = ({ value }) => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            if (typeof fragmentsManager.list.onItemSet.remove === "function") {
              fragmentsManager.list.onItemSet.remove(handler);
            }
            resolve(value ?? null);
          };

          fragmentsManager.list.onItemSet.add(handler);

          timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            if (typeof fragmentsManager.list.onItemSet.remove === "function") {
              fragmentsManager.list.onItemSet.remove(handler);
            }
            reject(new Error("Model load event timed out."));
          }, timeoutMs);
        });

      const waitForModelFromList = (timeoutMs) =>
        new Promise((resolve) => {
          const start = Date.now();
          const interval = setInterval(() => {
            const elapsed = Date.now() - start;
            if (elapsed > timeoutMs) {
              clearInterval(interval);
              resolve(null);
              return;
            }

            if (!fragmentsManager?.list) return;

            let candidate = null;
            if (typeof fragmentsManager.list.values === "function") {
              const values = Array.from(fragmentsManager.list.values());
              candidate = values[values.length - 1] ?? null;
            } else if (fragmentsManager.list.ids && typeof fragmentsManager.list.get === "function") {
              const ids = Array.from(fragmentsManager.list.ids);
              const lastId = ids[ids.length - 1];
              candidate = lastId !== undefined ? fragmentsManager.list.get(lastId) : null;
            }

            if (candidate) {
              clearInterval(interval);
              resolve(candidate);
            }
          }, 300);
        });

      const loadFn = ifcLoader?.load?.bind(ifcLoader);
      if (!loadFn) {
        throw new Error("IFC loader is not available.");
      }

      const attemptLoad = async (attemptName, attemptFn) => {
        try {
          logInfo(`Trying IFC load (${attemptName})...`);
          return await loadWithTimeout(
            attemptFn(),
            20000,
            `IFC loading timed out (${attemptName}).`
          );
        } catch (error) {
          logWarn(`Load attempt failed (${attemptName}): ${error.message || error}`);
          return null;
        }
      };

      const attempts = [
        ["file-arg", () => loadFn(file)],
        ["file-arg-options", () => loadFn(file, { name: file.name, ...loadOptions })],
        ["3-args", () => loadFn(data, false, file.name)],
        ["1-arg", () => loadFn(data)],
        ["2-args", () => loadFn(data, { name: file.name })],
        ["4-args", () => loadFn(data, false, file.name, loadOptions)],
        ["2-args-options", () => loadFn(data, { name: file.name, ...loadOptions })],
      ];

      const eventPromise = waitForModelFromEvent(60000).catch(() => null);
      let model = null;

      for (const [name, fn] of attempts) {
        model = await attemptLoad(name, fn);
        if (model) break;
      }

      if (!model) {
        model = await eventPromise;
      }

      if (!model) {
        model = await waitForModelFromList(5000);
      }

      if (!model) {
        throw new Error("IFC load did not return a model.");
      }

      if (fragmentsManager?.list && typeof fragmentsManager.list.getKey === "function") {
        const existingKey = fragmentsManager.list.getKey(model);
        if (existingKey === undefined && typeof fragmentsManager.list.add === "function") {
          fragmentsManager.list.add(model);
        }
      }

      clearTimeout(progressTimeout);
      updateLoadingProgress(100);

      if (debugModel) debugModel.textContent = "loaded";
      setStatus(`Loaded ${file.name} (${schema}).`);
      logInfo(`Loaded ${file.name}.`);

      // Manually trigger model setup if it wasn't added automatically
      if (model && !currentModel) {
        currentModel = model;
        model.useCamera(world.camera.three);
        world.scene.three.add(model.object);
        fragments.core.update(true);
        fitCameraToModel(world.camera, model.object);
        logInfo("Model added to scene.");

        await buildObjectTree(model).catch(error => {
          console.error("Failed to build object tree:", error);
        });

        if (typeof model.highlight === "function") {
          await colorizeCategories(model);
          await fragments.core.update(true);
        }
      }

      if (currentToken !== loadToken) {
        return;
      }

      if (currentModel) {
        await colorizeCategories(currentModel);
        if (fragmentsManager && fragmentsManager.core) {
          await fragmentsManager.core.update(true);
        }
      }
    } catch (error) {
      console.error("Failed to load IFC:", error);
      showError(`Failed to load: ${error.message || error}`);
    } finally {
      if (currentToken === loadToken) {
        updateLoadingProgress(0);
      }
      hideLoadingBar();
      isLoadingIfc = false;
    }
  };

  fileInput?.addEventListener("change", (event) => {
    const [file] = event.target.files || [];
    if (file) {
      logInfo(`Selected file: ${file.name}`);
      loadIfcFromFile(file).catch((error) => showError(error.message || error));
    }
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

  window.addEventListener("click", async (event) => {
    const target = event.target;
    const clickedViewer = viewer && viewer.contains(target);
    const clickedProperties = propertiesPanel && propertiesPanel.contains(target);
    const clickedObjectTree = objectTreePanel && objectTreePanel.contains(target);
    const clickedPropertiesToggle = propertiesShow && propertiesShow.contains(target);
    const clickedObjectTreeToggle = objectTreeShow && objectTreeShow.contains(target);

    if (clickedViewer || clickedProperties || clickedObjectTree || clickedPropertiesToggle || clickedObjectTreeToggle) {
      return;
    }

    await clearSelectionHighlight();
  });

  propertiesClear?.addEventListener("click", async () => {
    await clearSelectionHighlight();
    setPropertiesMessage("Click an element to view properties.");
  });

  logClear?.addEventListener("click", () => {
    if (logContent) {
      logContent.innerHTML = "";
    }
  });

  propertiesToggle?.addEventListener("click", () => {
    if (propertiesPanel) {
      propertiesPanel.classList.add("hidden");
    }
    if (propertiesShow) {
      propertiesShow.style.display = "block";
    }
  });

  propertiesShow?.addEventListener("click", () => {
    if (propertiesPanel) {
      propertiesPanel.classList.remove("hidden");
    }
    if (propertiesShow) {
      propertiesShow.style.display = "none";
    }
  });

  objectTreeToggle?.addEventListener("click", () => {
    if (objectTreePanel) {
      objectTreePanel.classList.add("hidden");
    }
    if (objectTreeShow) {
      objectTreeShow.style.display = "block";
    }
  });

  objectTreeShow?.addEventListener("click", () => {
    if (objectTreePanel) {
      objectTreePanel.classList.remove("hidden");
    }
    if (objectTreeShow) {
      objectTreeShow.style.display = "none";
    }
  });

  objectTreeCollapse?.addEventListener("click", () => {
    collapseAllTreeNodes();
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

  // Dock initialization
  const dock = document.getElementById("dock");
  const dockItems = document.querySelectorAll(".dock-item");

  dockItems.forEach((item) => {
    item.addEventListener("click", () => {
      const feature = item.getAttribute("data-feature");
      console.log(`Feature clicked: ${feature}`);
      // Add feature handlers here in the future
    });
  });

  // Show dock on hover, hide after mouse leaves
  if (dock) {
    dock.addEventListener("mouseenter", () => {
      dock.classList.add("visible");
    });

    dock.addEventListener("mouseleave", () => {
      dock.classList.remove("visible");
    });
  }
};

boot().catch((error) => showError(error.message || error));

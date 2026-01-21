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

// Store current model globally
let currentModel = null;
let currentHighlightedItem = null; // Track currently highlighted item
let fragmentsManager = null; // Store fragments manager globally

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

const updateLoadingProgress = (progress) => {
  const percentage = Math.round(progress);
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
  if (!model || typeof model.getCategories !== "function" || typeof model.highlight !== "function") return;

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
  } catch (e) {
    console.warn("Failed to reapply category highlights:", e);
  }
};

const colorizeCategories = async (model) => {
  if (!model || typeof model.getCategories !== "function" || typeof model.highlight !== "function") return;

  try {
    const categories = await model.getCategories();
    for (const category of categories) {
      const regex = new RegExp(`^${category}$`);
      const items = await model.getItemsOfCategories([regex]);
      const localIds = Object.values(items).flat();
      if (localIds.length === 0) continue;

      try {
        await model.highlight(localIds, {
          customId: `category-${category}`,
          color: new THREE.Color(colorForCategory(category)),
          renderedFaces: FRAGS.RenderedFaces.ALL,
          opacity: 1,
          transparent: false,
        });
      } catch (highlightError) {
        console.warn(`Failed to highlight category ${category}:`, highlightError);
      }
    }
  } catch (error) {
    console.error(`Failed to colorize categories: ${error.message || error}`);
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

    await reapplyCategoryHighlights(model);
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
    if (category && typeof model.removeHighlight === "function") {
      try {
        await model.removeHighlight([localId], `category-${category}`);
      } catch (removeError) {
        // Ignore if removal fails
      }
    }

    await model.highlight([localId], {
      customId: selectionFillId,
      color: selectionFillColor,
      renderedFaces: FRAGS.RenderedFaces.ALL,
      opacity: 1,
      transparent: false,
      stroke: 0,
    });

    await model.highlight([localId], {
      customId: selectionWireId,
      color: selectionWireColor,
      renderedFaces: selectionRenderedFaces,
      opacity: 0,
      transparent: true,
      stroke: 10,
    });
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

const raycastercreateTreeNode = (label, children = [], icon = "📦", count = 0, data = {}) => {
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
}; const buildObjectTree = async (model) => {
  try {
    setObjectTreeMessage("Building tree...");

    const categories = await model.getCategories();
    const rootNodes = [];

    for (const category of categories) {
      const regex = new RegExp(`^${category}$`);
      const items = await model.getItemsOfCategories([regex]);
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
  } catch (error) {
    setObjectTreeMessage(`Error building tree: ${error.message || error}`);
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
  fragmentsManager = fragments; // Store globally for highlighting
  const workerUrl = "/worker.mjs";
  fragments.init(workerUrl);

  world.camera.controls.addEventListener("rest", () => {
    fragments.core.update(true);
  });

  fragments.list.onItemSet.add(({ value: model }) => {
    // Store the current model globally
    currentModel = model;

    model.useCamera(world.camera.three);
    world.scene.three.add(model.object);
    fragments.core.update(true);
    fitCameraToModel(world.camera, model.object);

    // Build object tree
    buildObjectTree(model).catch(error => {
      console.error("Failed to build object tree:", error);
    });

    void (async () => {
      if (typeof model.highlight !== "function") {
        console.warn("Model does not have highlight method, skipping colorization");
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
    showLoadingBar();
    const buffer = await file.arrayBuffer();
    const schema = inferSchema(buffer);
    if (debugSchema) debugSchema.textContent = schema;
    setStatus(`Loading ${file.name} (${schema})...`);
    const data = new Uint8Array(buffer);
    await ifcLoader.load(data, false, file.name, {
      processData: {
        progressCallback: (progress) => {
          updateLoadingProgress(progress);
          setStatus(`Loading ${file.name} (${schema}) ${Math.round(progress)}%`);
        },
      },
    });
    hideLoadingBar();
    if (debugModel) debugModel.textContent = "loaded";
    setStatus(`Loaded ${file.name} (${schema}).`);
    if (currentModel) {
      await colorizeCategories(currentModel);
      if (fragmentsManager && fragmentsManager.core) {
        await fragmentsManager.core.update(true);
      }
    }
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
};

boot().catch((error) => showError(error.message || error));

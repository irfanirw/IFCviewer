import * as OBC from "@thatopen/components";
import * as FRAGS from "@thatopen/fragments";
import * as THREE from "three";

const viewer = document.getElementById("viewer");
const statusEl = document.getElementById("status");
const fileInput = document.getElementById("ifc-input");
const resetButton = document.getElementById("reset-camera");
const projectionToggleButton = document.getElementById("projection-toggle");
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
const objectTreeExpand = document.getElementById("objecttree-expand");
const objectTreeCollapse = document.getElementById("objecttree-collapse");
const objectTreeToggle = document.getElementById("objecttree-toggle");
const objectTreeShow = document.getElementById("objecttree-show");
const objectTreeScrollbar = document.getElementById("objecttree-scrollbar");
const objectTreeScrollbarThumb = document.getElementById("objecttree-scrollbar-thumb");
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
let currentModelLabel = null;

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
  const formatted = key.split('.').map(part =>
    part.charAt(0).toUpperCase() + part.slice(1)
  ).join('.');

  return normalizeIfcText(formatted);
};

const normalizeIfcToken = (token) => {
  if (token.length < 3) return token;
  const prefix = token.slice(0, 3);
  if (prefix.toLowerCase() !== "ifc") return token;

  const rest = token.slice(3);
  if (!rest) return "Ifc";

  const isAllLower = rest === rest.toLowerCase();
  const isAllUpper = rest === rest.toUpperCase();
  if (isAllLower || isAllUpper) {
    return `Ifc${rest.charAt(0).toUpperCase()}${rest.slice(1).toLowerCase()}`;
  }

  return `Ifc${rest}`;
};

const normalizeIfcText = (text) => {
  if (typeof text !== "string" || text.length === 0) return text;
  return text.replace(/\bifc[a-z0-9_]*\b/gi, (match) => normalizeIfcToken(match));
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
    const rawValue = value !== null && value !== undefined ? String(value) : '-';
    valueCell.textContent = normalizeIfcText(rawValue);

    row.appendChild(keyCell);
    row.appendChild(valueCell);
    tbody.appendChild(row);
  }
  table.appendChild(tbody);

  return table;
};

const reapplyCategoryHighlights = async (model) => {
  // Keep original IFC colors; no reapply needed.
  void model;
};

const colorizeCategories = async (model) => {
  // Preserve imported IFC colors; no-op.
  void model;
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
    // Reset highlight/color/opacity to restore original IFC materials.
    if (typeof model.resetHighlight === "function") {
      try { await model.resetHighlight([localId]); } catch (e) { /* noop */ }
    }
    if (typeof model.resetColor === "function") {
      try { await model.resetColor([localId]); } catch (e) { /* noop */ }
    }
    if (typeof model.resetOpacity === "function") {
      try { await model.resetOpacity([localId]); } catch (e) { /* noop */ }
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
      preserveOriginalMaterial: true,
      renderedFaces: FRAGS.RenderedFaces.ALL,
      opacity: 1,
      transparent: false,
      // Keep selection visible through other geometry.
      depthTest: false,
      depthWrite: false,
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
    updateObjectTreeScrollbar();
  }
};

const updateObjectTreeScrollbar = () => {
  if (!objectTreeContent || !objectTreeScrollbar || !objectTreeScrollbarThumb) return;

  const { scrollHeight, clientHeight, scrollTop } = objectTreeContent;
  if (clientHeight === 0) return;

  const minThumb = 24;
  const hasOverflow = scrollHeight > clientHeight + 1;
  const rawThumb = (clientHeight / Math.max(scrollHeight, clientHeight)) * clientHeight;
  const thumbHeight = Math.max(minThumb, Math.min(clientHeight, rawThumb));
  const maxTop = Math.max(0, clientHeight - thumbHeight);
  const top = hasOverflow && scrollHeight > clientHeight
    ? (scrollTop / (scrollHeight - clientHeight)) * maxTop
    : 0;

  objectTreeScrollbarThumb.style.height = `${thumbHeight}px`;
  objectTreeScrollbarThumb.style.transform = `translateY(${top}px)`;
};

if (objectTreeContent) {
  objectTreeContent.addEventListener("scroll", updateObjectTreeScrollbar, { passive: true });
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(() => updateObjectTreeScrollbar());
    observer.observe(objectTreeContent);
    if (objectTreePanel) observer.observe(objectTreePanel);
  }
}

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
  const labelWithCount = count > 0 ? `${label} (${count})` : label;
  itemLabel.textContent = normalizeIfcText(labelWithCount);

  header.appendChild(expandIcon);
  header.appendChild(itemIcon);
  header.appendChild(itemLabel);

  // Count is shown inline in the label to match the reference tree style.

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

      requestAnimationFrame(updateObjectTreeScrollbar);

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

const spatialHierarchy = [
  "IfcProject",
  "IfcSite",
  "IfcBuilding",
  "IfcBuildingStorey",
  "IfcSpace",
];

const spatialCategoryKeys = new Set(spatialHierarchy.map((category) => category.toLowerCase()));

const getCategoryKey = (category) => (
  typeof category === "string" ? category.toLowerCase() : ""
);

const isCategory = (node, category) => (
  getCategoryKey(node?.category) === category.toLowerCase()
);

const isSpatialCategory = (category) => spatialCategoryKeys.has(getCategoryKey(category));

const getSpatialChildren = (node) => Array.isArray(node?.children) ? node.children : [];

const collectDescendants = (node, predicate) => {
  const results = [];
  const visit = (item) => {
    if (!item) return;
    if (predicate(item)) results.push(item);
    const children = getSpatialChildren(item);
    for (const child of children) visit(child);
  };
  visit(node);
  return results;
};

const uniqueByLocalId = (nodes) => {
  const seen = new Set();
  const unique = [];
  for (const node of nodes) {
    const id = node?.localId;
    if (id == null) {
      unique.push(node);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(node);
  }
  return unique;
};

const formatSpatialLabel = (category, _localId, placeholderSuffix = "") => {
  if (placeholderSuffix) return `${category} (${placeholderSuffix})`;
  return category;
};

const getNodeName = (node) => (
  node?.name ?? node?.Name ?? node?.LongName ?? null
);

const spatialNameCategories = new Set(["IfcSite", "IfcBuilding", "IfcBuildingStorey"]);

const formatSpatialLabelFromNode = (node, categoryFallback, placeholderSuffix = "") => {
  const category = categoryFallback ?? node?.category ?? "IfcSpatialElement";
  if (category === "IfcSpace") {
    return "IfcSpace";
  }
  if (spatialNameCategories.has(category)) {
    const name = getNodeName(node);
    if (name && String(name).trim().length) {
      return normalizeIfcText(String(name).trim());
    }
  }
  return formatSpatialLabel(category, node?.localId, placeholderSuffix);
};

const pluralizeIfcCategory = (category) => {
  if (!category) return category;
  if (category.endsWith("s")) return category;
  if (category.endsWith("y")) return `${category.slice(0, -1)}ies`;
  return `${category}s`;
};

const formatElementLabel = (element, category) => {
  const name = getNodeName(element);
  const localId = element?.localId;
  if (name && localId != null) {
    return normalizeIfcText(`${name}:${localId}`);
  }
  if (name) return normalizeIfcText(String(name));
  if (localId != null) return `${category}:${localId}`;
  return category;
};

const isNonSpatialElement = (node) => {
  if (!node) return false;
  if (node.localId == null) return false;
  return !isSpatialCategory(node.category);
};

const getDirectElementChildren = (node) => (
  getSpatialChildren(node).filter((child) => isNonSpatialElement(child))
);

const collectElements = (root, options = {}) => {
  const elements = [];
  const seen = new Set();
  const stopAtSpaces = Boolean(options.stopAtSpaces);
  const traverseElementChildren = Boolean(options.traverseElementChildren);

  const visit = (item) => {
    if (!item) return;
    const isSpace = isCategory(item, "IfcSpace");
    if (stopAtSpaces && isSpace && item !== root) return;

    const isSpatial = item.category && isSpatialCategory(item.category);
    const isElement = !isSpatial && item.localId != null;
    if (isElement && !seen.has(item.localId)) {
      seen.add(item.localId);
      elements.push(item);
      if (!traverseElementChildren) return;
    }

    const children = getSpatialChildren(item);
    for (const child of children) visit(child);
  };

  visit(root);
  return elements;
};

const getStoreyElements = async (storey, model) => {
  let elements = collectElements(storey, { stopAtSpaces: true });
  let usedRelations = false;

  if (
    elements.length === 0 &&
    model &&
    typeof model.getItemsChildren === "function" &&
    storey?.localId != null
  ) {
    try {
      const childIds = await model.getItemsChildren([storey.localId]);
      if (Array.isArray(childIds) && childIds.length > 0) {
        usedRelations = true;
        let categories = [];
        if (typeof model.getItemsCategories === "function") {
          categories = await model.getItemsCategories(childIds);
        }
        elements = childIds.map((id, index) => ({
          localId: id,
          category: categories?.[index] ?? null,
        }));
      }
    } catch (e) {
      console.warn("Failed to resolve storey elements via relations:", e);
    }
  }

  return { elements, usedRelations };
};

const resolveElementCategory = (element, fallback = "IfcElement") => {
  const raw = element?.category ?? element?.type ?? element?.Type ?? element?._category?.value;
  if (!raw) return fallback;
  return normalizeIfcText(raw);
};

const buildElementNode = async (element, model = null) => {
  const category = resolveElementCategory(element, "IfcElement");
  const label = formatElementLabel(element, category);
  const childElements = getDirectElementChildren(element);
  const childCategoryNodes = childElements.length
    ? await buildElementCategoryNodes(childElements, {}, model)
    : [];
  return createTreeNode(
    label,
    childCategoryNodes,
    "📄",
    childElements.length,
    { localId: element.localId, category }
  );
};

const buildElementCategoryNodes = async (elements, options = {}, model = null) => {
  const allowEmpty = Boolean(options.allowEmpty);
  if (!elements.length) {
    if (!allowEmpty) return [];
    const emptyLeaf = createTreeNode("No elements", [], "⋯", 0, {});
    const placeholder = createTreeNode("IfcElement", [emptyLeaf], "🧱", 0, {});
    return [placeholder];
  }

  const elementsWithMissingCategory = elements.filter(
    (element) => !element?.category && !element?.type && !element?.Type
  );
  const lookupModel = model ?? currentModel;
  if (elementsWithMissingCategory.length && lookupModel?.getItemsData) {
    try {
      const ids = elementsWithMissingCategory
        .map((element) => element.localId)
        .filter((id) => id != null);
      if (ids.length) {
        const itemsData = await lookupModel.getItemsData(ids);
        const byId = new Map();
        ids.forEach((id, index) => byId.set(id, itemsData?.[index] ?? null));
        elementsWithMissingCategory.forEach((element) => {
          const data = byId.get(element.localId);
          if (!data) return;
          element.type = data.type
            ?? data.Type
            ?? data.ifcType
            ?? data._type?.value
            ?? data._category?.value
            ?? null;
        });
      }
    } catch (e) {
      console.warn("Failed to resolve element categories:", e);
    }
  }

  const grouped = new Map();
  for (const element of elements) {
    const category = resolveElementCategory(element, "IfcElement");
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category).push(element);
  }

  const categoryNodes = [];
  for (const [category, items] of grouped.entries()) {
    const elementNodes = [];
    for (const element of items) {
      elementNodes.push(await buildElementNode(element, model));
    }
    const categoryNode = createTreeNode(
      pluralizeIfcCategory(category),
      elementNodes,
      "🧱",
      elementNodes.length,
      {}
    );
    categoryNodes.push(categoryNode);
  }

  return categoryNodes;
};

const getModelElementIds = async (model) => {
  if (!model) return [];

  if (typeof model.getItemsIdsWithGeometry === "function") {
    try {
      const ids = await model.getItemsIdsWithGeometry();
      if (Array.isArray(ids) && ids.length) return ids;
    } catch (e) {
      console.warn("Failed to get items with geometry IDs:", e);
    }
  }

  if (typeof model.getItemsWithGeometry === "function") {
    try {
      const items = await model.getItemsWithGeometry();
      if (Array.isArray(items) && items.length) {
        if (typeof items[0] === "number") return items;
        const ids = items
          .map((item) => item?.localId ?? item?.id ?? item?.expressID ?? null)
          .filter((id) => id != null);
        if (ids.length) return ids;
      }
    } catch (e) {
      console.warn("Failed to get items with geometry:", e);
    }
  }

  if (typeof model.getLocalIds === "function") {
    try {
      const ids = await model.getLocalIds();
      if (Array.isArray(ids) && ids.length) return ids;
    } catch (e) {
      console.warn("Failed to get local IDs:", e);
    }
  }

  return [];
};

const getModelElements = async (model) => {
  const ids = await getModelElementIds(model);
  if (!ids.length) return [];

  let categories = [];
  if (typeof model?.getItemsCategories === "function") {
    try {
      categories = await model.getItemsCategories(ids);
    } catch (e) {
      console.warn("Failed to get item categories:", e);
    }
  }

  const elements = ids.map((id, index) => ({
    localId: id,
    category: categories?.[index] ?? null,
  }));

  return uniqueByLocalId(elements).filter(
    (element) => element?.localId != null && !isSpatialCategory(element?.category)
  );
};

const buildElementsBranch = async (model) => {
  const elements = await getModelElements(model);
  if (!elements.length) return null;

  const elementCategoryNodes = await buildElementCategoryNodes(elements, {}, model);
  if (!elementCategoryNodes.length) return null;

  return createTreeNode(
    "Elements",
    elementCategoryNodes,
    "🧱",
    elements.length,
    {}
  );
};

const buildPlaceholderChain = async (elements, model = null) => {
  const elementGroups = await buildElementCategoryNodes(elements, { allowEmpty: true }, model);
  if (!elementGroups.length) return [];

  const spaceNode = createTreeNode(
    formatSpatialLabel("IfcSpace", null, "Unassigned"),
    elementGroups,
    "🏠",
    elements.length,
    {}
  );
  const storeyNode = createTreeNode(
    formatSpatialLabel("IfcBuildingStorey", null, "Unassigned"),
    [spaceNode],
    "🏢",
    1,
    {}
  );
  return [storeyNode];
};

const buildSpaceNode = async (space, model) => {
  const spaceElements = collectElements(space, { stopAtSpaces: true });
  const children = await buildElementCategoryNodes(spaceElements, { allowEmpty: true }, model);
  const label = "IfcSpace";
  return createTreeNode(
    label,
    children,
    "🏠",
    spaceElements.length,
    space?.localId != null ? { localId: space.localId, category: "IfcSpace" } : {}
  );
};

const countElementsUnder = (node) =>
  collectElements(node, { stopAtSpaces: false, traverseElementChildren: false }).length;

const getModelLabel = (model) => {
  if (currentModelLabel) return currentModelLabel;
  if (typeof model?.name === "string" && model.name.trim().length) return model.name;
  if (typeof model?.modelID === "string" && model.modelID.trim().length) return model.modelID;
  if (typeof model?.id === "string" && model.id.trim().length) return model.id;
  return "IFC Model";
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

    const spatialRoot = await resolvedModel.getSpatialStructure();
    const rootNodes = [];

    const projectNodes = uniqueByLocalId(
      spatialRoot?.category === "IfcProject"
        ? [spatialRoot]
        : collectDescendants(spatialRoot, (node) => isCategory(node, "IfcProject"))
    );

    const effectiveProjects = projectNodes.length
      ? projectNodes
      : [{
        category: "IfcProject",
        localId: null,
        children: spatialRoot ? [spatialRoot] : [],
      }];

    for (const project of effectiveProjects) {
      const siteNodes = uniqueByLocalId(
        collectDescendants(project, (node) => isCategory(node, "IfcSite"))
      );

      const effectiveSites = siteNodes.length
        ? siteNodes
        : [{
          category: "IfcSite",
          localId: null,
          children: getSpatialChildren(project),
        }];

      const siteTreeNodes = [];

      for (const site of effectiveSites) {
        const buildingNodes = uniqueByLocalId(
          collectDescendants(site, (node) => isCategory(node, "IfcBuilding"))
        );

        const effectiveBuildings = buildingNodes.length
          ? buildingNodes
          : [{
            category: "IfcBuilding",
            localId: null,
            children: getSpatialChildren(site),
          }];

        const buildingTreeNodes = [];

        for (const building of effectiveBuildings) {
          const storeyNodes = uniqueByLocalId(
            collectDescendants(building, (node) => isCategory(node, "IfcBuildingStorey"))
          );

          const effectiveStoreys = storeyNodes.length
            ? storeyNodes
            : [{
              category: "IfcBuildingStorey",
              localId: null,
              children: getSpatialChildren(building),
            }];

          const storeyTreeNodes = [];

          for (const storey of effectiveStoreys) {
            const storeySpaces = uniqueByLocalId(
              collectDescendants(storey, (node) => isCategory(node, "IfcSpace"))
            );

            let storeySpaceNodes = [];
            for (const space of storeySpaces) {
              storeySpaceNodes.push(await buildSpaceNode(space, resolvedModel));
            }

            const { elements: storeyElements, usedRelations } = await getStoreyElements(storey, resolvedModel);
            if (usedRelations) {
              storeySpaceNodes = [];
            }
            const elementCategoryNodes = await buildElementCategoryNodes(storeyElements, {}, resolvedModel);

            const storeyChildren = [];
            if (storeySpaceNodes.length) {
              storeyChildren.push(
                createTreeNode(
                  pluralizeIfcCategory("IfcSpace"),
                  storeySpaceNodes,
                  "🏠",
                  storeySpaceNodes.length,
                  {}
                )
              );
            }
            storeyChildren.push(...elementCategoryNodes);

            if (storeyChildren.length === 0) {
              const children = await buildElementCategoryNodes([], { allowEmpty: true }, resolvedModel);
              storeyChildren.push(
                createTreeNode(
                  pluralizeIfcCategory("IfcSpace"),
                  [createTreeNode(formatSpatialLabel("IfcSpace", null, "Unassigned"), children, "🏠", 0, {})],
                  "🏠",
                  0,
                  {}
                )
              );
            }

            const storeyLabel = formatSpatialLabelFromNode(
              storey,
              "IfcBuildingStorey",
              storey.localId == null ? "Unassigned" : ""
            );
            const storeyNode = createTreeNode(
              storeyLabel,
              storeyChildren,
              "🏢",
              countElementsUnder(storey),
              storey.localId != null ? { localId: storey.localId, category: "IfcBuildingStorey" } : {}
            );
            storeyTreeNodes.push(storeyNode);
          }

          if (storeyTreeNodes.length === 0) {
            const buildingElements = collectElements(building, { stopAtSpaces: true });
            const placeholderStoreys = await buildPlaceholderChain(buildingElements, resolvedModel);
            if (placeholderStoreys.length) {
              storeyTreeNodes.push(...placeholderStoreys);
            }
          }

          const buildingLabel = formatSpatialLabelFromNode(
            building,
            "IfcBuilding",
            building.localId == null ? "Unassigned" : ""
          );
          const buildingNode = createTreeNode(
            buildingLabel,
            storeyTreeNodes,
            "🏗️",
            countElementsUnder(building),
            building.localId != null ? { localId: building.localId, category: "IfcBuilding" } : {}
          );
          buildingTreeNodes.push(buildingNode);
        }

        if (buildingTreeNodes.length === 0) {
          const siteElements = collectElements(site, { stopAtSpaces: true });
          const placeholderStoreys = await buildPlaceholderChain(siteElements, resolvedModel);
          if (placeholderStoreys.length) {
            const buildingNode = createTreeNode(
              formatSpatialLabel("IfcBuilding", null, "Unassigned"),
              placeholderStoreys,
              "🏗️",
              placeholderStoreys.length,
              {}
            );
            buildingTreeNodes.push(buildingNode);
          }
        }

        const siteLabel = formatSpatialLabelFromNode(
          site,
          "IfcSite",
          site.localId == null ? "Unassigned" : ""
        );
        const siteNode = createTreeNode(
          siteLabel,
          buildingTreeNodes,
          "🌍",
          countElementsUnder(site),
          site.localId != null ? { localId: site.localId, category: "IfcSite" } : {}
        );
        siteTreeNodes.push(siteNode);
      }

      const projectLabel = formatSpatialLabelFromNode(
        project,
        "IfcProject",
        project.localId == null ? "Unassigned" : ""
      );
      const projectNode = createTreeNode(
        projectLabel,
        siteTreeNodes,
        "🏁",
        countElementsUnder(project),
        project.localId != null ? { localId: project.localId, category: "IfcProject" } : {}
      );
      rootNodes.push(projectNode);
    }

    if (rootNodes.length === 0) {
      setObjectTreeMessage("No objects found in model.");
      return;
    }

    const allSpaces = uniqueByLocalId(
      collectDescendants(spatialRoot, (node) => isCategory(node, "IfcSpace"))
    );
    const spaceNodes = [];
    for (const space of allSpaces) {
      spaceNodes.push(await buildSpaceNode(space, resolvedModel));
    }
    const spacesBranch = spaceNodes.length
      ? createTreeNode("Spaces", spaceNodes, "🏠", spaceNodes.length, {})
      : null;

    const elementsBranch = await buildElementsBranch(resolvedModel);

    const fileRootChildren = [];
    if (spacesBranch) fileRootChildren.push(spacesBranch);
    if (elementsBranch) fileRootChildren.push(elementsBranch);
    fileRootChildren.push(...rootNodes);

    const fileRootLabel = getModelLabel(resolvedModel);
    const fileRootNode = createTreeNode(fileRootLabel, fileRootChildren, "📁", 0, {});

    const rootUl = document.createElement("ul");
    rootUl.className = "tree-node";
    rootUl.appendChild(fileRootNode);

    if (objectTreeContent) {
      objectTreeContent.innerHTML = "";
      objectTreeContent.appendChild(rootUl);
    }
    requestAnimationFrame(updateObjectTreeScrollbar);
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
  requestAnimationFrame(updateObjectTreeScrollbar);
};

const expandAllTreeNodes = () => {
  if (!objectTreeContent) return;

  const allItems = objectTreeContent.querySelectorAll(".tree-item");
  allItems.forEach((item) => {
    const header = item.querySelector(".tree-item-header");
    const expandIcon = header?.querySelector(".tree-expand-icon");
    const children = item.querySelector(".tree-children");
    if (!children) return;

    expandIcon?.classList.add("expanded");
    children.classList.remove("collapsed");
    children.style.maxHeight = `${children.scrollHeight}px`;
  });

  requestAnimationFrame(updateObjectTreeScrollbar);
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

const projectionLabel = (projection) => (
  projection === "Orthographic" ? "Parallel" : "Perspective"
);

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

  const updateProjectionToggleLabel = () => {
    if (!projectionToggleButton) return;
    const current = world.camera?.projection?.current ?? "Perspective";
    projectionToggleButton.textContent = `Projection: ${projectionLabel(current)}`;
  };

  updateProjectionToggleLabel();
  world.camera?.projection?.onChanged?.add?.(() => {
    updateProjectionToggleLabel();
  });

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
    axisRenderer.setClearColor(0x000000, 0);
    axisRenderer.shadowMap.enabled = false;
    axisHelperContainer.appendChild(axisRenderer.domElement);

    const axisGroup = new THREE.Group();
    axisScene.add(axisGroup);

    const axisLength = 2.4;
    const axisRadius = 0.08;
    const axisTipLength = 0.45;
    const axisTipRadius = 0.18;

    const makeAxis = (color, axis) => {
      const group = new THREE.Group();
      const rodGeom = new THREE.CylinderGeometry(axisRadius, axisRadius, axisLength, 12);
      const tipGeom = new THREE.ConeGeometry(axisTipRadius, axisTipLength, 16);
      const material = new THREE.MeshBasicMaterial({ color });

      const rod = new THREE.Mesh(rodGeom, material);
      const tip = new THREE.Mesh(tipGeom, material);

      if (axis === "x") {
        rod.rotation.z = Math.PI / 2;
        rod.position.x = axisLength / 2;
        tip.rotation.z = Math.PI / 2;
        tip.position.x = axisLength + axisTipLength / 2;
      } else if (axis === "y") {
        rod.position.y = axisLength / 2;
        tip.position.y = axisLength + axisTipLength / 2;
      } else {
        rod.rotation.x = Math.PI / 2;
        rod.position.z = axisLength / 2;
        tip.rotation.x = Math.PI / 2;
        tip.position.z = axisLength + axisTipLength / 2;
      }

      group.add(rod, tip);
      return group;
    };

    axisGroup.add(makeAxis("#ff3b30", "x"));
    axisGroup.add(makeAxis("#34c759", "y"));
    axisGroup.add(makeAxis("#0a84ff", "z"));

    const makeAxisLabel = (text, color) => {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = "bold 72px 'Space Grotesk', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = color;
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 6;
      ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);

      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
      });
      const geometry = new THREE.PlaneGeometry(0.9, 0.9);
      return new THREE.Mesh(geometry, material);
    };

    const axisLabelGroup = new THREE.Group();
    axisScene.add(axisLabelGroup);

    const xLabel = makeAxisLabel("X", "#ff3b30");
    const yLabel = makeAxisLabel("Y", "#34c759");
    const zLabel = makeAxisLabel("Z", "#0a84ff");

    if (xLabel && yLabel && zLabel) {
      xLabel.position.set(2.4, 0, 0);
      yLabel.position.set(0, 2.4, 0);
      zLabel.position.set(0, 0, 2.4);
      axisLabelGroup.add(xLabel, yLabel, zLabel);
    }

    const axisQuat = new THREE.Quaternion();

    const updateAxisHelper = () => {
      const mainCam = world.camera && world.camera.three ? world.camera.three : null;

      if (mainCam) {
        mainCam.getWorldQuaternion(axisQuat);
        axisGroup.quaternion.copy(axisQuat);
      } else {
        axisGroup.quaternion.identity();
      }

      axisLabelGroup.quaternion.copy(axisGroup.quaternion);

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
      currentModelLabel = file.name;

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

  projectionToggleButton?.addEventListener("click", async () => {
    try {
      if (world.camera?.projection?.toggle) {
        await world.camera.projection.toggle();
        updateProjectionToggleLabel();
      }
    } catch (error) {
      console.error("Failed to toggle projection:", error);
      showError(`Projection toggle failed: ${error.message || error}`);
    }
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

  objectTreeExpand?.addEventListener("click", () => {
    expandAllTreeNodes();
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

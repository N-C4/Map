/* map.js */

// Initialize the map with the canvas renderer for better performance
const map = L.map("map", {
  crs: L.CRS.Simple,
  minZoom: -5,
  zoom: 1,
  preferCanvas: true,
});

const cdnImageCache = {};

// Set map bounds and add the base image overlay
const bounds = [
  [0, 0],
  [1000, 1000],
];
L.imageOverlay("Gta5MapCayo.png", bounds).addTo(map);
map.fitBounds(bounds);

// Global variables
let categories = {};
let dataSource = "categories.json"; // default (will be set via modal)
const markersGroup = L.layerGroup().addTo(map);
let currentHighlightedMarker = null; // used for marker highlighting

/**
 * Highlights the given marker (and unhighlights any previous marker)
 */
function highlightMarker(marker) {
  if (currentHighlightedMarker && currentHighlightedMarker !== marker) {
    const prevEl = currentHighlightedMarker.getElement();
    if (prevEl) {
      prevEl.classList.remove("highlighted");
    }
  }
  currentHighlightedMarker = marker;
  const el = marker.getElement();
  if (el) {
    el.classList.remove("highlighted");
    void el.offsetWidth; // force reflow to restart animation
    el.classList.add("highlighted");
    el.addEventListener(
      "animationend",
      () => {
        el.classList.remove("highlighted");
      },
      { once: true }
    );
  }
}

/**
 * Returns the total number of images (locations) in the data.
 */
const getTotalImageCount = (categoriesData) => {
  let count = 0;
  for (let category in categoriesData) {
    count += categoriesData[category].locations.length;
  }
  return count;
};

/**
 * Updates the loading indicator's inner HTML with progress info.
 */
const updateLoadingIndicator = (loaded, total) => {
  const loadingIndicator = document.getElementById("loading-indicator");
  loadingIndicator.innerHTML = `
    <div>
      <i class="fas fa-spinner fa-spin"></i>
      <p style="margin-top:10px; font-size: 20px;">
          ${loaded} out of ${total} images loaded
      </p>
    </div>
  `;
};

/**
 * Prefetches all images from the categories data.
 */
const prefetchImages = (categoriesData) =>
  new Promise((resolve, reject) => {
    const totalImages = getTotalImageCount(categoriesData);
    let loadedCount = 0;
    if (totalImages === 0) {
      resolve();
      return;
    }
    for (let category in categoriesData) {
      categoriesData[category].locations.forEach((location) => {
        const img = new Image();
        img.onload = img.onerror = () => {
          loadedCount++;
          updateLoadingIndicator(loadedCount, totalImages);
          if (loadedCount === totalImages) {
            resolve();
          }
        };
        img.src = location.img;
      });
    }
  });

/**
 * Load and cache a CDN image.
 */
const loadCachedCDNImage = (url) =>
  new Promise((resolve, reject) => {
    if (cdnImageCache[url]) {
      resolve(cdnImageCache[url]);
    } else {
      const img = new Image();
      img.onload = () => {
        cdnImageCache[url] = url;
        resolve(url);
      };
      img.onerror = () => {
        reject(new Error(`Failed to load image: ${url}`));
      };
      img.src = url;
    }
  });

/**
 * Prefetch CDN images used in recipe ingredients.
 */
const prefetchCDNImages = (categoriesData) =>
  new Promise((resolve) => {
    const cdnUrls = new Set();
    Object.keys(categoriesData).forEach((category) => {
      categoriesData[category].locations.forEach((location) => {
        if (location.bench && Array.isArray(location.recipes)) {
          location.recipes.forEach((recipe) => {
            recipe.ingredients.forEach((ingredient) => {
              const url = `https://cdn.prodigyrp.net/inventory-images/${ingredient.id}.webp`;
              cdnUrls.add(url);
            });
          });
        }
      });
    });
    const urls = Array.from(cdnUrls);
    if (urls.length === 0) {
      resolve();
      return;
    }
    let loadedCount = 0;
    urls.forEach((url) => {
      loadCachedCDNImage(url)
        .then(() => {
          loadedCount++;
          if (loadedCount === urls.length) {
            resolve();
          }
        })
        .catch(() => {
          loadedCount++;
          if (loadedCount === urls.length) {
            resolve();
          }
        });
    });
  });

/**
 * Loads data from the given JSON file, prefetches images, and builds the sidebar and markers.
 */
const loadData = (fileName) => {
  markersGroup.clearLayers();
  const locationsListContainer = document.getElementById("locations-list");
  locationsListContainer.innerHTML =
    '<h1 class="locations-title">Crime Categories</h1>';

  fetch(fileName)
    .then((response) => {
      if (!response.ok) throw new Error("Network response was not ok");
      return response.json();
    })
    .then((data) => {
      categories = data;
      const categoryIcons = {};
      for (const category in categories) {
        const color = categories[category].color;
        categoryIcons[category] = L.divIcon({
          className: "custom-div-icon",
          html: getPinSVG(color),
          iconSize: [32, 32],
          popupAnchor: [0, -10],
        });
      }
      const loadingIndicator = document.getElementById("loading-indicator");
      loadingIndicator.style.display = "block";
      updateLoadingIndicator(0, getTotalImageCount(categories));
      prefetchImages(categories).then(() => {
        prefetchCDNImages(categories).then(() => {
          loadingIndicator.style.display = "none";
          loadCategories(categoryIcons);
        });
      });
    })
    .catch((error) => {
      console.error("Error loading JSON file:", error);
    });
};

/**
 * Builds the sidebar and adds markers for each category.
 */
const loadCategories = (categoryIcons) => {
  const locationsListContainer = document.getElementById("locations-list");
  const fragment = document.createDocumentFragment();

  for (const category in categories) {
    const categoryData = categories[category];
    const categoryColor = categoryData.color;

    const categoryContainer = document.createElement("div");
    categoryContainer.className = "category-container";

    const colorIndicator = document.createElement("div");
    colorIndicator.className = "color-indicator";
    colorIndicator.style.backgroundColor = categoryColor;

    const categoryName = document.createElement("span");
    categoryName.textContent = category;

    categoryContainer.appendChild(colorIndicator);
    categoryContainer.appendChild(categoryName);

    const accordionButton = document.createElement("button");
    accordionButton.className = "accordion";
    accordionButton.appendChild(categoryContainer);

    const panel = document.createElement("div");
    panel.className = "panel";

    categoryData.locations.forEach((location) => {
      const icon = categoryIcons[category];
      const marker = L.marker(
        [parseFloat(location.lat), parseFloat(location.lng)],
        { icon: icon, title: location.name }
      ).addTo(markersGroup);
      location.marker = marker;

      marker.on("click", function () {
        highlightMarker(this);
        showSidePopup(location);
      });

      const listItem = document.createElement("div");
      listItem.className = "locations-item";
      listItem.textContent = location.name;
      listItem.onclick = () => {
        map.setView(
          [parseFloat(location.lat), parseFloat(location.lng)],
          map.getZoom(),
          { animate: true }
        );
        setTimeout(() => {
          map.panBy([0, -100], { animate: true });
          highlightMarker(location.marker);
          showSidePopup(location);
        }, 300);
      };

      panel.appendChild(listItem);
    });

    fragment.appendChild(accordionButton);
    fragment.appendChild(panel);

    accordionButton.addEventListener("click", function () {
      this.classList.toggle("active");
      const panel = this.nextElementSibling;
      panel.style.display =
        panel.style.display === "block" ? "none" : "block";
    });
  }

  locationsListContainer.appendChild(fragment);
};

/**
 * Displays a side popup with location details.
 */
const showSidePopup = (location) => {
  // Use either Info or info field
  const infoText =
    location.Info || location.info
      ? `<p style="margin-top: 5px; font-style: italic;">${
          location.Info || location.info
        }</p>`
      : "";
  let content = `
    <h1>${location.name}</h1>
    ${infoText}
    <img
      src="${location.img}"
      alt="${location.name}"
      title="${location.name}"
      style="width:100%; height:auto; margin-bottom:10px; cursor:pointer;"
    />
  `;

  if (location.bench === true && Array.isArray(location.recipes)) {
    content += `<h3>Recipes:</h3>
                <div id="recipe-menu" style="display: flex; flex-wrap: wrap; margin-left:10px;">`;
    location.recipes.forEach((recipe) => {
      const recipeImageUrl = `https://cdn.prodigyrp.net/inventory-images/${recipe.id}.webp`;
      content += `
        <img
          class="recipe-image"
          src="${recipeImageUrl}"
          alt="${recipe.display}"
          title="${recipe.display}"
          data-recipe-id="${recipe.id}"
          style="width:50px; height:50px; cursor:pointer; margin:2px; border:1px solid rgb(134, 214, 36); border-radius:4px;"
        />
      `;
    });
    content += `</div>
                <div id="recipe-details"></div>`;
  }

  const popupContentEl = document.getElementById("side-popup-content");
  popupContentEl.innerHTML = content;
  document.getElementById("side-popup").style.display = "block";

  const sideImg = popupContentEl.querySelector("img");
  if (sideImg) {
    sideImg.addEventListener("click", function () {
      openModal(this.src);
    });
  }

  const recipeImages = popupContentEl.querySelectorAll(".recipe-image");
  recipeImages.forEach((img) => {
    img.addEventListener("click", function () {
      const recipeId = this.getAttribute("data-recipe-id");
      const recipe = location.recipes.find((r) => r.id === recipeId);
      if (!recipe) return;
      const detailsContainer = document.getElementById("recipe-details");
      detailsContainer.innerHTML = "";
      const craftingUI = buildCraftingUI(recipe);
      detailsContainer.appendChild(craftingUI);
    });
  });

  enableIngredientTooltips(popupContentEl, "img");
};

/**
 * Builds the crafting UI for a selected recipe.
 */
const buildCraftingUI = (recipe) => {
  const container = document.createElement("div");
  container.classList.add("crafting-ui");

  container.innerHTML = `
      ${
        recipe.requirements
          ? `<div class="crafting-requirements">Requires: ${recipe.requirements}</div>`
          : ""
      }
      <div class="crafting-header">
        <div>
          <div class="crafting-item-name">${recipe.display}</div>
          <div class="crafting-time">
            <span class="time-label">Crafting Time:</span>
            <span class="time-value">5s</span>
          </div>
        </div>
        <div class="crafting-quantity">
          <div class="crafting-quantity-title">QUANTITY</div>
          <div>1</div>
        </div>
      </div>
      <div class="items-required-container">
        <div class="items-required-title">ITEMS REQUIRED</div>
        <div class="items-required"></div>
      </div>
  `;

  container.style.border = recipe.requirements
    ? "1px solid red"
    : "1px solid rgb(134, 214, 36)";

  const itemsRequiredEl = container.querySelector(".items-required");
  recipe.ingredients.forEach((ingredient) => {
    const itemEl = document.createElement("div");
    itemEl.classList.add("item-required");
    const ingredientImageUrl = `https://cdn.prodigyrp.net/inventory-images/${ingredient.id}.webp`;
    itemEl.innerHTML = `
      <img src="${ingredientImageUrl}"
           alt="${ingredient.display}"
           title="${ingredient.display}"
           style="width:30px; height:30px; margin-right:5px; border:1px solid rgb(134, 214, 36); border-radius:4px;" />
      <span class="quantity-text">0/${ingredient.amount}</span>
    `;
    itemsRequiredEl.appendChild(itemEl);
  });

  enableIngredientTooltips(container, ".items-required img");
  return container;
};

/**
 * Returns the CDN image URL for a given name.
 */
const getCDNImageUrl = (name) => {
  const formattedName = name.toLowerCase().replace(/\s+/g, "_");
  return `https://cdn.prodigyrp.net/inventory-images/${formattedName}.webp`;
};

/**
 * Opens the image modal for an enlarged view.
 */
const openModal = (imageSrc) => {
  const modal = document.getElementById("image-modal");
  const modalImg = document.getElementById("modal-image");
  modal.style.display = "block";
  modalImg.src = imageSrc;
  const closeBtn = document.getElementsByClassName("modal-close")[0];
  closeBtn.onclick = () => {
    modal.style.display = "none";
  };
  modal.onclick = () => {
    modal.style.display = "none";
  };
};

// Create a new marker via double-click on the map
map.on("dblclick", (e) => {
  createMarkerWithPopup(e.latlng);
});

const createMarkerWithPopup = (latlng) => {
  console.log("Creating marker at latlng:", latlng);
  const marker = L.marker(latlng, { draggable: true }).addTo(map);
  const popupContent = `
    <div>
      <label for="marker-name">Name:</label><br>
      <input id="marker-name" type="text" placeholder="Enter location name"/><br>
      <label for="marker-img">Image URL:</label><br>
      <input id="marker-img" type="text" placeholder="Enter image URL"/><br><br>
      <button id="copy-marker">Copy to Clipboard</button>
    </div>
  `;
  marker.bindPopup(popupContent);
  setTimeout(() => {
    marker.openPopup();
  }, 50);

  marker.on("popupopen", () => {
    setTimeout(() => {
      const copyButton = document.getElementById("copy-marker");
      if (copyButton) {
        copyButton.addEventListener("click", () => {
          const name = document.getElementById("marker-name").value;
          const imgUrl = document.getElementById("marker-img").value;
          const markerData = {
            id: Date.now(),
            lat: latlng.lat.toFixed(6),
            lng: latlng.lng.toFixed(6),
            name: name,
            img: imgUrl,
          };
          const formattedData = JSON.stringify(markerData);
          copyToClipboard(formattedData);
          marker
            .bindPopup(`<p>Marker copied to clipboard!</p>`)
            .openPopup();
          setTimeout(() => {
            map.removeLayer(marker);
          }, 1500);
        });
      } else {
        console.error("Copy button not found.");
      }
    }, 10);
  });

  marker.on("popupclose", () => {
    map.removeLayer(marker);
  });
};

const enableIngredientTooltips = (container, imgSelector) => {
  const tooltipEl = document.createElement("div");
  tooltipEl.className = "custom-tooltip";
  document.body.appendChild(tooltipEl);
  const images = container.querySelectorAll(imgSelector);
  images.forEach((img) => {
    img.addEventListener("mouseenter", (e) => {
      const text = img.getAttribute("alt") || img.getAttribute("title") || "";
      tooltipEl.textContent = text;
      tooltipEl.style.display = "block";
    });
    img.addEventListener("mousemove", (e) => {
      tooltipEl.style.top = e.pageY + 10 + "px";
      tooltipEl.style.left = e.pageX + 10 + "px";
    });
    img.addEventListener("mouseleave", () => {
      tooltipEl.style.display = "none";
    });
  });
};

/**
 * Copies the given text to the clipboard.
 */
const copyToClipboard = (text) => {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      console.log("Copied to clipboard successfully!");
    })
    .catch((err) => {
      console.error("Failed to copy text to clipboard:", err);
      alert(
        "Copying to clipboard failed. Ensure you are using HTTPS or localhost."
      );
    });
};

/**
 * Generates an SVG pin icon with the given color.
 */
const getPinSVG = (color) => {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32px" height="32px" fill="${color}" stroke="black" stroke-width="1.5">
      <path d="M12 2C8.69 2 6 4.69 6 8c0 4.27 5.25 11.54 5.42 11.75.3.36.85.36 1.15 0C12.75 19.54 18 12.27 18 8c0-3.31-2.69-6-6-6zm0 9.5c-1.93 0-3.5-1.57-3.5-3.5S10.07 4.5 12 4.5 15.5 6.07 15.5 8 13.93 11.5 12 11.5z"/>
    </svg>
  `;
};

// Close bench modal
document.getElementById("benchModalClose").onclick = () => {
  document.getElementById("benchModal").style.display = "none";
};

// Close side popup
document
  .getElementById("side-popup-close")
  .addEventListener("click", () => {
    document.getElementById("side-popup").style.display = "none";
  });

// Close bench modal when clicking outside the modal content
window.onclick = (event) => {
  const benchModal = document.getElementById("benchModal");
  if (event.target === benchModal) {
    benchModal.style.display = "none";
  }
};

window.addEventListener("DOMContentLoaded", () => {
    dataSource = "categories.json";
    loadData(dataSource);
});


// Set the initial zoom level (if needed)

map.setZoom(1);

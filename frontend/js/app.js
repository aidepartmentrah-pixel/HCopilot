/**
 * app.js — Application entry point for HCopilot.
 *
 * Serves: the #datasets-grid container inside the "Datasets" section of index.html.
 *
 * Runs once the DOM is fully loaded (DOMContentLoaded event).
 * Builds the datasets grid inside #datasets-grid by rendering HTML cards
 * for every entry in the DATASETS and MANAGED_DATASETS registries defined
 * in utils.js.  This means adding a new dataset only requires updating the
 * registry — no HTML changes are needed.
 *
 * Rendering order:
 *   1. Read-only dataset cards   (from DATASETS        via createDatasetCard)
 *   2. Editable dataset cards    (from MANAGED_DATASETS via createManagedDatasetCard)
 *
 * Both createDatasetCard and createManagedDatasetCard are defined in
 * dataset_display.js and generate the full card HTML including table
 * containers, pagination controls, and action buttons.
 *
 * Key globals consumed here (defined in utils.js):
 *   DATASETS         — array of read-only dataset descriptors
 *   MANAGED_DATASETS — array of editable dataset descriptors
 *
 * Key globals consumed here (defined in dataset_display.js):
 *   createDatasetCard()        — renders one read-only dataset card
 *   createManagedDatasetCard() — renders one editable dataset card
 */

// App initialisation — runs once the DOM is ready.
// Builds the datasets grid from the DATASETS and MANAGED_DATASETS registries
// defined in utils.js so no HTML has to be written by hand for each dataset.

document.addEventListener('DOMContentLoaded', function() {
    const grid = document.getElementById('datasets-grid');

    // Render read-only dataset cards first, then editable (managed) dataset cards.
    // Array.map() converts each registry entry to an HTML string; join('') merges
    // them into a single string for a single innerHTML assignment (more efficient
    // than appending one element at a time).
    grid.innerHTML =
        DATASETS.map(d => createDatasetCard(d)).join('') +
        MANAGED_DATASETS.map(d => createManagedDatasetCard(d)).join('');
});

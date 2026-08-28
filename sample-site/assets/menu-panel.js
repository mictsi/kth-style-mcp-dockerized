/**
 * Close all <dialog>s (modal and non-modal) in a document
 */
function closeAllDialogs() {
    document.querySelectorAll("dialog").forEach((dialog) => dialog.close());
}
/**
 * Add basic mouse and keyboard event listeners to a dialog (<dialog>)
 * @param dialog A <dialog> element
 */
function addEventListeners(dialog) {
    const closeButton = dialog.querySelector(".kth-icon-button.close");
    dialog.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            dialog.close();
        }
    });
    if (closeButton instanceof HTMLButtonElement) {
        closeButton.addEventListener("click", () => {
            closeAllDialogs();
        });
    }
}
/**
 * Add mouse and keyboard event listeners to a dialog (<dialog>) that is not a modal
 * @param dialog A <dialog> element
 * @param button Button or clickable element used to open the dialog
 */
function addNonModalEventListeners(dialog, button) {
    addEventListeners(dialog);
    button.addEventListener("click", (e) => {
        e.preventDefault();
        if (!dialog.open) {
            closeAllDialogs();
            dialog.show();
        }
        else {
            closeAllDialogs();
        }
    });
    // Close the dialog if clicking outside the modal
    document.addEventListener("click", (e) => {
        if (dialog.open &&
            !e.composedPath().includes(button) &&
            !e.composedPath().includes(dialog)) {
            e.preventDefault();
            closeAllDialogs();
        }
    });
}
/**
 * Add mouse and keyboard event listeners to a modal (<dialog>)
 * @param modal A <dialog> element
 * @param previousModal A <dialog> element that was clicked to open the current modal
 */
function addModalEventListeners(modal, button, previousModal) {
    const backButton = modal.querySelector(".kth-button.back");
    addEventListeners(modal);
    button.addEventListener("click", (e) => {
        e.preventDefault();
        closeAllDialogs();
        modal.showModal();
    });
    // Close the current modal and open the previous modal with a back button
    if (backButton instanceof HTMLButtonElement) {
        backButton.addEventListener("click", () => {
            modal.close();
            if (previousModal) {
                previousModal.showModal();
            }
        });
    }
}
class MenuPanel {
    static init(container, items) {
        if (!container)
            return;
        for (const item of items) {
            if (!(item instanceof HTMLElement))
                continue;
            const dialog = item.nextElementSibling;
            if (!(dialog instanceof HTMLDialogElement))
                continue;
            addNonModalEventListeners(dialog, item);
        }
        container.addEventListener("focusout", function (e) {
            const target = e.relatedTarget;
            if (target && target instanceof Node && !container.contains(target)) {
                closeAllDialogs();
            }
        });
    }
    static initModal(button, modal) {
        if (!(button instanceof HTMLElement))
            return;
        if (!(modal instanceof HTMLDialogElement))
            return;
        addModalEventListeners(modal, button);
    }
    static initModals(items, previousModal) {
        if (previousModal && !(previousModal instanceof HTMLDialogElement))
            return;
        for (const item of items) {
            if (!(item instanceof HTMLElement))
                continue;
            const dataId = item.getAttribute("data-id");
            const modal = document.querySelector(`.kth-mobile-menu[data-id='${dataId}']`);
            if (!(modal instanceof HTMLDialogElement))
                return;
            addModalEventListeners(modal, item, previousModal);
        }
    }
    static initTranslationModal(button, modal) {
        if (!(button instanceof HTMLElement))
            return;
        if (!(modal instanceof HTMLDialogElement))
            return;
        // Only open the modal if there is no href
        if (!button.getAttribute("href")) {
            addNonModalEventListeners(modal, button);
        }
    }
}

export { MenuPanel };

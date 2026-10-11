/* ============================================================
   Expense Tracker — script.js
   Pure Vanilla JS, no dependencies.

   Data flow:
     transactions[] ──► recalculate() ──► updateSummary()
                     ──► renderList()  ──► DOM

   Persistence: localStorage (key: "et_transactions")
   ============================================================ */

"use strict";

/* ────────────────────────────────────────────
   1. STATE
   ──────────────────────────────────────────── */

/**
 * @typedef {{ id: string, description: string, amount: number, type: 'income'|'expense', date: string }} Transaction
 */

/** @type {Transaction[]} */
let transactions = [];

/* ────────────────────────────────────────────
   2. DOM REFERENCES
   ──────────────────────────────────────────── */
const form            = document.getElementById("transaction-form");
const descInput       = document.getElementById("description");
const amountInput     = document.getElementById("amount");
const descError       = document.getElementById("description-error");
const amountError     = document.getElementById("amount-error");

const balanceEl       = document.getElementById("balance");
const totalIncomeEl   = document.getElementById("total-income");
const totalExpenseEl  = document.getElementById("total-expense");

const listEl          = document.getElementById("transaction-list");
const emptyStateEl    = document.getElementById("empty-state");
const clearBtn        = document.getElementById("clear-btn");

const footerYear      = document.getElementById("footer-year");

/* ────────────────────────────────────────────
   3. UTILITIES
   ──────────────────────────────────────────── */

/**
 * Format a number as Indonesian Rupiah.
 * Uses Intl.NumberFormat with explicit options so the thousands
 * separator (titik) and decimal separator (koma) are always
 * consistent across all browsers and operating systems.
 *
 * @param {number} value
 * @returns {string}  e.g. "Rp 1.250.000"
 */
const _rupiahFormatter = new Intl.NumberFormat("id-ID", {
  style:                 "currency",
  currency:              "IDR",
  currencyDisplay:       "symbol",   // renders "Rp"
  minimumFractionDigits: 0,          // no decimals when value is whole
  maximumFractionDigits: 0,          // strip cents for cleaner display
});

function formatRupiah(value) {
  // Intl formats negative numbers with a minus sign; we always pass
  // Math.abs() because the +/− prefix is handled by the caller.
  return _rupiahFormatter.format(Math.abs(value));
}

/**
 * Format raw digits into a thousands-separated display string for
 * the amount input field (no currency symbol, just the number).
 *
 * Strategy:
 *  1. Strip every non-digit character from the raw input string.
 *  2. Parse to integer (raw numeric value, stored in dataset.rawValue).
 *  3. Re-format with Intl using "decimal" style so we get "1.250.000"
 *     without the "Rp" prefix — keeping the field clean.
 *  4. Write the formatted string back into input.value so the user
 *     sees the separator as they type.
 *
 * @param {HTMLInputElement} input  - the amount <input> element
 */
const _inputFormatter = new Intl.NumberFormat("id-ID", {
  style:                 "decimal",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatAmountInput(input) {
  // 1. Remove all non-digit characters (titik separator, spaces, etc.)
  const digitsOnly = input.value.replace(/\D/g, "");

  if (digitsOnly === "") {
    // Empty — clear both display and raw value
    input.value          = "";
    input.dataset.rawValue = "";
    return;
  }

  // 2. Parse to number (safe: digitsOnly contains only 0-9)
  const numeric = parseInt(digitsOnly, 10);

  // 3. Store the clean numeric string as the source of truth
  input.dataset.rawValue = String(numeric);

  // 4. Write formatted value back (e.g. "1250000" → "1.250.000")
  //    Preserve caret position workaround: since we replace the whole
  //    value, the cursor jumps to end — acceptable for a numeric field.
  input.value = _inputFormatter.format(numeric);
}

/**
 * Generate a simple unique ID (timestamp + random suffix).
 * @returns {string}
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Format a Date object into a short locale string.
 * @param {string} isoString
 * @returns {string}  e.g. "25 Jun 2025, 14:30"
 */
function formatDate(isoString) {
  return new Date(isoString).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ────────────────────────────────────────────
   4. PERSISTENCE (localStorage)
   ──────────────────────────────────────────── */
const STORAGE_KEY = "et_transactions";

/** Load transactions from localStorage into memory. */
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    transactions = raw ? JSON.parse(raw) : [];
  } catch {
    // Corrupted data — reset gracefully
    transactions = [];
  }
}

/** Persist current transactions array to localStorage. */
function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}

/* ────────────────────────────────────────────
   5. CALCULATIONS
   ──────────────────────────────────────────── */

/**
 * Derive totals from the transactions array.
 *
 * Algorithm:
 *  - Iterate once through all transactions (O(n)).
 *  - Accumulate income and expense into separate buckets.
 *  - Balance = totalIncome − totalExpense.
 *
 * @returns {{ balance: number, totalIncome: number, totalExpense: number }}
 */
function recalculate() {
  let totalIncome  = 0;
  let totalExpense = 0;

  for (const tx of transactions) {
    if (tx.type === "income") {
      totalIncome += tx.amount;   // add to income bucket
    } else {
      totalExpense += tx.amount;  // add to expense bucket
    }
  }

  // Net balance: positive = surplus, negative = deficit
  const balance = totalIncome - totalExpense;

  return { balance, totalIncome, totalExpense };
}

/* ────────────────────────────────────────────
   6. DOM RENDERING
   ──────────────────────────────────────────── */

/** Update the summary cards (balance, income, expense) in the DOM. */
function updateSummary() {
  const { balance, totalIncome, totalExpense } = recalculate();

  balanceEl.textContent      = formatRupiah(balance);
  totalIncomeEl.textContent  = formatRupiah(totalIncome);
  totalExpenseEl.textContent = formatRupiah(totalExpense);

  // Colour-code the balance figure
  if (balance < 0) {
    balanceEl.classList.add("text-red-400");
    balanceEl.classList.remove("text-white", "text-green-400");
  } else if (balance > 0) {
    balanceEl.classList.add("text-green-400");
    balanceEl.classList.remove("text-white", "text-red-400");
  } else {
    balanceEl.classList.add("text-white");
    balanceEl.classList.remove("text-green-400", "text-red-400");
  }
}

/**
 * Build and return a single <li> element for a transaction.
 * @param {Transaction} tx
 * @returns {HTMLLIElement}
 */
function createListItem(tx) {
  const li = document.createElement("li");
  li.className    = `transaction-item ${tx.type}`;
  li.dataset.id   = tx.id;

  // Amount prefix: + for income, − for expense
  const prefix = tx.type === "income" ? "+" : "−";

  li.innerHTML = `
    <div class="flex-1 min-w-0">
      <p class="text-sm font-medium text-gray-800 truncate">${escapeHtml(tx.description)}</p>
      <p class="text-xs text-gray-400 mt-0.5">${formatDate(tx.date)}</p>
    </div>
    <span class="tx-amount text-sm font-semibold whitespace-nowrap">
      ${prefix} ${formatRupiah(tx.amount)}
    </span>
    <button
      class="delete-btn"
      aria-label="Hapus transaksi ${escapeHtml(tx.description)}"
      data-id="${tx.id}"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2"
           viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  `;

  return li;
}

/**
 * Simple HTML escape to prevent XSS when injecting user input.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Re-render the full transaction list from the transactions array. */
function renderList() {
  // Clear existing items
  listEl.innerHTML = "";

  if (transactions.length === 0) {
    emptyStateEl.classList.remove("hidden");
    clearBtn.classList.add("hidden");
    return;
  }

  emptyStateEl.classList.add("hidden");
  clearBtn.classList.remove("hidden");

  // Render newest first (reverse chronological order)
  const sorted = [...transactions].reverse();
  const fragment = document.createDocumentFragment();

  for (const tx of sorted) {
    fragment.appendChild(createListItem(tx));
  }

  // Single DOM write for performance
  listEl.appendChild(fragment);
}

/** Full re-render: recalculate totals + refresh list. */
function render() {
  updateSummary();
  renderList();
}

/* ────────────────────────────────────────────
   7. FORM VALIDATION
   ──────────────────────────────────────────── */

/**
 * Validate form inputs. Shows inline error messages.
 * @returns {{ valid: boolean, description: string, amount: number }}
 */
function validateForm() {
  let valid = true;

  const description = descInput.value.trim();
  // Read the raw numeric value stored by formatAmountInput, not the
  // formatted display string which contains non-numeric separators.
  const amount      = parseFloat(amountInput.dataset.rawValue || "");

  // Validate description
  if (!description) {
    descError.classList.remove("hidden");
    descInput.classList.add("border-red-400");
    valid = false;
  } else {
    descError.classList.add("hidden");
    descInput.classList.remove("border-red-400");
  }

  // Validate amount:
  //  - NaN  → field kosong atau bukan angka
  //  - === 0 → user mengetik "0" (tidak boleh nol)
  //  - < 0  → tidak mungkin lewat UI, tapi dijaga untuk keamanan
  const amountInvalid = isNaN(amount) || !isFinite(amount) || amount <= 0;
  if (amountInvalid) {
    amountError.classList.remove("hidden");
    amountInput.classList.add("border-red-400");
    valid = false;
  } else {
    amountError.classList.add("hidden");
    amountInput.classList.remove("border-red-400");
  }

  return { valid, description, amount };
}

/* ────────────────────────────────────────────
   8. EVENT HANDLERS
   ──────────────────────────────────────────── */

/** Handle form submission — add a new transaction. */
function handleSubmit(e) {
  e.preventDefault();

  const { valid, description, amount } = validateForm();
  if (!valid) return;

  // Determine selected type from radio group
  const typeRadio = form.querySelector('input[name="type"]:checked');
  const type      = typeRadio ? typeRadio.value : "income";

  /** @type {Transaction} */
  const newTransaction = {
    id:          generateId(),
    description: description,
    amount:      amount,
    type:        type,
    date:        new Date().toISOString(),
  };

  // Prepend so newest is first in storage (mirrors reversed render)
  transactions.unshift(newTransaction);

  saveToStorage();
  render();
  resetForm();
}

/** Reset form fields to their default state after submission. */
function resetForm() {
  descInput.value            = "";
  amountInput.value          = "";
  amountInput.dataset.rawValue = "";   // clear raw value alongside display

  // Reset to "income" radio
  const incomeRadio = form.querySelector('input[name="type"][value="income"]');
  if (incomeRadio) {
    incomeRadio.checked = true;
    updateTypeButtons();
  }

  descInput.focus();
}

/**
 * Handle click on a delete button inside the transaction list.
 * Uses event delegation on the <ul> element.
 * @param {MouseEvent} e
 */
function handleDeleteClick(e) {
  const btn = e.target.closest(".delete-btn");
  if (!btn) return;

  const id = btn.dataset.id;

  // Remove the transaction with matching id
  transactions = transactions.filter((tx) => tx.id !== id);

  saveToStorage();
  render();
}

/** Clear all transactions after confirmation. */
function handleClearAll() {
  if (!confirm("Hapus semua transaksi? Tindakan ini tidak bisa dibatalkan.")) return;

  transactions = [];
  saveToStorage();
  render();
}

/* ────────────────────────────────────────────
   9. TYPE BUTTON VISUAL STATE
   ──────────────────────────────────────────── */

/**
 * Sync the visual `.selected` class on type-toggle buttons
 * to the currently checked radio input.
 */
function updateTypeButtons() {
  const incomeBtn  = form.querySelector(".income-btn");
  const expenseBtn = form.querySelector(".expense-btn");
  const checkedVal = form.querySelector('input[name="type"]:checked')?.value;

  incomeBtn.classList.toggle("selected",  checkedVal === "income");
  expenseBtn.classList.toggle("selected", checkedVal === "expense");
}

/* ────────────────────────────────────────────
   10. INITIALISATION
   ──────────────────────────────────────────── */

function init() {
  // Set footer year
  footerYear.textContent = new Date().getFullYear();

  // Load persisted data
  loadFromStorage();

  // Initial render
  render();

  // Set initial type button state
  updateTypeButtons();

  // ── Event listeners ──────────────────────
  form.addEventListener("submit", handleSubmit);

  // Type radio buttons — update visual state on change
  form.querySelectorAll('input[name="type"]').forEach((radio) => {
    radio.addEventListener("change", updateTypeButtons);
  });

  // Event delegation: delete buttons inside the list
  listEl.addEventListener("click", handleDeleteClick);

  // Clear all button
  clearBtn.addEventListener("click", handleClearAll);

  // Live validation feedback: clear error on input
  descInput.addEventListener("input", () => {
    if (descInput.value.trim()) {
      descError.classList.add("hidden");
      descInput.classList.remove("border-red-400");
    }
  });

  // Live formatting: apply thousands separator as the user types
  amountInput.addEventListener("input", () => {
    formatAmountInput(amountInput);

    // Clear validation error once a valid positive number is present
    const v = parseFloat(amountInput.dataset.rawValue || "");
    if (v > 0 && isFinite(v)) {
      amountError.classList.add("hidden");
      amountInput.classList.remove("border-red-400");
    }
  });
}

// Kick everything off once the DOM is ready
document.addEventListener("DOMContentLoaded", init);

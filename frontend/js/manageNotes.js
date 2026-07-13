// frontend/js/manageNotes.js
import { db, storage } from "../firestore.js";
import {
  collection, onSnapshot, doc, deleteDoc, updateDoc, query, orderBy,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { ref, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// --- Guard admin route (matches admin.html's localStorage flag) ---
if (localStorage.getItem("admin") !== "true") {
  window.location.href = "../login.html";
}

let allNotes = [];
let selectedIds = new Set();

const tbody = document.getElementById("notesTableBody");
const emptyState = document.getElementById("emptyState");
const totalCount = document.getElementById("totalCount");
const searchInput = document.getElementById("searchInput");
const courseFilter = document.getElementById("courseFilter");
const statusFilter = document.getElementById("statusFilter");
const selectAll = document.getElementById("selectAll");
const bulkBar = document.getElementById("bulkBar");
const bulkCount = document.getElementById("bulkCount");

const COURSE_DOT = { Foundation: "bg-emerald-400", Intermediate: "bg-amber-400", Final: "bg-indigo-400" };

/* ---------------- Live listener ---------------- */
const notesQuery = query(collection(db, "notes"), orderBy("createdAt", "desc"));
onSnapshot(notesQuery, (snap) => {
  allNotes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  totalCount.textContent = allNotes.length;
  render();
}, (err) => {
  console.error(err);
  showToast("Couldn't load notes: " + err.message, "error");
});

/* ---------------- Filtering ---------------- */
function getFiltered() {
  const term = searchInput.value.trim().toLowerCase();
  const course = courseFilter.value;
  const status = statusFilter.value;

  return allNotes.filter((n) => {
    if (course && n.course !== course) return false;
    if (status && n.status !== status) return false;
    if (term) {
      const hay = `${n.title || ""} ${n.subject || ""} ${n.faculty || ""}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });
}
[searchInput, courseFilter, statusFilter].forEach((el) => el.addEventListener("input", render));

/* ---------------- Render ---------------- */
function render() {
  const rows = getFiltered();
  tbody.innerHTML = "";
  emptyState.classList.toggle("hidden", rows.length > 0);

  rows.forEach((n) => {
    const tr = document.createElement("tr");
    const dot = COURSE_DOT[n.course] || "bg-slate-500";
    const date = n.createdAt?.toDate ? n.createdAt.toDate().toLocaleDateString() : "—";
    const statusBadge = n.status === "Published"
      ? `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-300">Published</span>`
      : `<span class="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-300">Draft</span>`;
    tr.innerHTML = `
      <td class="p-4"><input type="checkbox" class="row-check" data-id="${n.id}" ${selectedIds.has(n.id) ? "checked" : ""}></td>
      <td class="p-4">
        <div class="flex items-center gap-3">
          <span class="w-2 h-2 rounded-full ${dot}"></span>
          <div>
            <div class="font-semibold text-slate-100">${escapeHtml(n.title || "Untitled")}</div>
            <div class="text-xs text-slate-500">${escapeHtml(n.chapter || "")}</div>
          </div>
        </div>
      </td>
      <td class="p-4">${escapeHtml(n.course || "—")}<br><span class="text-xs text-slate-500">${escapeHtml(n.subject || "")}</span></td>
      <td class="p-4">${escapeHtml(n.faculty || "—")}</td>
      <td class="p-4">${n.downloads ?? 0}</td>
      <td class="p-4">${n.views ?? 0}</td>
      <td class="p-4">${statusBadge}</td>
      <td class="p-4 text-slate-400">${date}</td>
      <td class="p-4">
        <div class="flex gap-2">
          <button class="w-8 h-8 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300" title="Edit" data-edit="${n.id}"><i class="fa-solid fa-pen text-xs"></i></button>
          ${n.pdfURL ? `<a class="w-8 h-8 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 flex items-center justify-center" title="Open PDF" href="${n.pdfURL}" target="_blank" rel="noopener"><i class="fa-solid fa-eye text-xs"></i></a>` : ""}
          <button class="w-8 h-8 rounded-lg border border-rose-800/60 hover:bg-rose-900/30 text-rose-300" title="Delete" data-delete="${n.id}"><i class="fa-solid fa-trash text-xs"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".row-check").forEach((cb) => cb.addEventListener("change", (e) => {
    const id = e.target.dataset.id;
    e.target.checked ? selectedIds.add(id) : selectedIds.delete(id);
    updateBulkBar();
  }));
  tbody.querySelectorAll("[data-edit]").forEach((btn) => btn.addEventListener("click", () => openEdit(btn.dataset.edit)));
  tbody.querySelectorAll("[data-delete]").forEach((btn) => btn.addEventListener("click", () => confirmDelete(btn.dataset.delete)));
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------------- Select all / bulk ---------------- */
selectAll.addEventListener("change", () => {
  const rows = getFiltered();
  rows.forEach((n) => (selectAll.checked ? selectedIds.add(n.id) : selectedIds.delete(n.id)));
  render();
  updateBulkBar();
});
function updateBulkBar() {
  bulkCount.textContent = selectedIds.size;
  bulkBar.classList.toggle("hidden", selectedIds.size === 0);
  bulkBar.classList.toggle("flex", selectedIds.size > 0);
}

document.getElementById("bulkDelete").addEventListener("click", async () => {
  if (!selectedIds.size) return;
  if (!confirm(`Delete ${selectedIds.size} note(s)? This also removes their files from Storage.`)) return;
  for (const id of Array.from(selectedIds)) await deleteNote(id, { silent: true });
  selectedIds.clear();
  updateBulkBar();
  showToast("Selected notes deleted.", "success");
});
document.getElementById("bulkPublish").addEventListener("click", () => bulkSetStatus("Published"));
document.getElementById("bulkDraft").addEventListener("click", () => bulkSetStatus("Draft"));

async function bulkSetStatus(status) {
  if (!selectedIds.size) return;
  for (const id of Array.from(selectedIds)) await updateDoc(doc(db, "notes", id), { status });
  showToast(`Updated ${selectedIds.size} note(s) to ${status}.`, "success");
  selectedIds.clear();
  updateBulkBar();
}

/* ---------------- Delete ---------------- */
async function confirmDelete(id) {
  const note = allNotes.find((n) => n.id === id);
  if (!confirm(`Delete "${note?.title || "this note"}"? This also removes its PDF/thumbnail from Storage.`)) return;
  await deleteNote(id);
}
async function deleteNote(id, opts = {}) {
  const note = allNotes.find((n) => n.id === id);
  try {
    if (note?.pdfPath) await deleteObject(ref(storage, note.pdfPath)).catch(() => {});
    if (note?.thumbPath) await deleteObject(ref(storage, note.thumbPath)).catch(() => {});
    await deleteDoc(doc(db, "notes", id));
    if (!opts.silent) showToast("Note deleted.", "success");
  } catch (err) {
    console.error(err);
    showToast("Delete failed: " + err.message, "error");
  }
}

/* ---------------- Edit modal ---------------- */
const editOverlay = document.getElementById("editOverlay");
const editForm = document.getElementById("editForm");

function openEdit(id) {
  const n = allNotes.find((x) => x.id === id);
  if (!n) return;
  document.getElementById("editId").value = n.id;
  document.getElementById("editTitle").value = n.title || "";
  document.getElementById("editCourse").value = n.course || "Foundation";
  document.getElementById("editSubject").value = n.subject || "";
  document.getElementById("editChapter").value = n.chapter || "";
  document.getElementById("editFaculty").value = n.faculty || "";
  document.getElementById("editDescription").value = n.description || "";
  document.getElementById("editStatus").value = n.status || "Draft";
  editOverlay.classList.remove("hidden");
  editOverlay.classList.add("flex");
}
document.getElementById("closeEdit").addEventListener("click", closeEdit);
document.getElementById("cancelEdit").addEventListener("click", closeEdit);
editOverlay.addEventListener("click", (e) => { if (e.target === editOverlay) closeEdit(); });
function closeEdit() { editOverlay.classList.add("hidden"); editOverlay.classList.remove("flex"); }

editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("editId").value;
  try {
    await updateDoc(doc(db, "notes", id), {
      title: document.getElementById("editTitle").value.trim(),
      course: document.getElementById("editCourse").value,
      subject: document.getElementById("editSubject").value.trim(),
      chapter: document.getElementById("editChapter").value.trim(),
      faculty: document.getElementById("editFaculty").value.trim(),
      description: document.getElementById("editDescription").value.trim(),
      status: document.getElementById("editStatus").value,
    });
    showToast("Note updated.", "success");
    closeEdit();
  } catch (err) {
    console.error(err);
    showToast("Update failed: " + err.message, "error");
  }
});

/* ---------------- Toasts ---------------- */
function showToast(message, type = "info") {
  let wrap = document.getElementById("toast-container");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "toast-container";
    wrap.className = "fixed top-6 right-6 z-50 flex flex-col gap-3";
    document.body.appendChild(wrap);
  }
  const bg = type === "success" ? "bg-emerald-600/90" : type === "error" ? "bg-rose-600/90" : "bg-indigo-600/90";
  const icon = type === "success" ? "fa-circle-check" : type === "error" ? "fa-circle-exclamation" : "fa-circle-info";
  const el = document.createElement("div");
  el.className = `${bg} backdrop-blur text-white text-sm px-5 py-3.5 rounded-xl shadow-xl flex items-center gap-3 border border-white/10`;
  el.innerHTML = `<i class="fa-solid ${icon}"></i><span>${message}</span>`;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

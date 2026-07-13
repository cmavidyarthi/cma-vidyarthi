// frontend/js/uploadNotes.js
// Upload pipeline: PDF/thumbnail -> Cloudinary -> get secure_url -> save note doc in Firestore.
// Firebase Storage is no longer used anywhere in this file.

import { db } from "../firestore.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ---------------- CLOUDINARY CONFIG ----------------
const CLOUD_NAME = "uaiykge3";
const UPLOAD_PRESET = "notes_upload";

// --- State ---
let selectedPdfFile = null;
let selectedThumbFile = null;

// --- DOM Elements ---
const form = document.getElementById('upload-notes-form');
const pdfDropzone = document.getElementById('pdf-dropzone');
const pdfFileInput = document.getElementById('note-pdf');
const pdfFileNameDisplay = document.getElementById('pdf-file-name');

const thumbDropzone = document.getElementById('thumb-dropzone');
const thumbFileInput = document.getElementById('note-thumbnail');
const thumbPreviewContainer = document.getElementById('thumb-preview-container');
const thumbPrompt = document.getElementById('thumb-prompt');

const progressContainer = document.getElementById('upload-progress-container');
const progressStatusText = document.getElementById('progress-status-text');
const progressPercentage = document.getElementById('progress-percentage');
const progressBar = document.getElementById('upload-progress-bar');
const submitBtn = document.getElementById('submit-btn');
const clearBtn = document.getElementById('clear-btn');
const toastContainer = document.getElementById('toast-container');

const DEFAULT_PDF_PROMPT = pdfFileNameDisplay ? pdfFileNameDisplay.innerHTML : "";

// --- Guard admin route (matches the localStorage flag admin.html actually sets) ---
if (localStorage.getItem("admin") !== "true") {
    showToast("Access denied. Please log in as an administrator.", "error");
    setTimeout(() => { window.location.href = "../login.html"; }, 1500);
}

// --- Toast UI Alerts ---
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    const bgClass = type === 'success' ? 'bg-emerald-600/90' : 'bg-rose-600/90';
    const iconClass = type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation';

    toast.className = `${bgClass} backdrop-blur text-white text-sm px-5 py-3.5 rounded-xl shadow-xl flex items-center gap-3 transition-all duration-300 transform translate-x-12 opacity-0 border border-white/10`;
    toast.innerHTML = `<i class="fa-solid ${iconClass}"></i> <span>${message}</span>`;

    toastContainer.appendChild(toast);
    setTimeout(() => toast.classList.remove('translate-x-12', 'opacity-0'), 10);
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-[-10px]');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// --- Drag & Drop ---
function setupDragAndDrop(zone, input, callback) {
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('border-indigo-500', 'bg-indigo-950/20');
    });
    zone.addEventListener('dragleave', () => {
        zone.classList.remove('border-indigo-500', 'bg-indigo-950/20');
    });
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('border-indigo-500', 'bg-indigo-950/20');
        if (e.dataTransfer.files.length > 0) callback(e.dataTransfer.files[0]);
    });
    input.addEventListener('change', (e) => {
        if (e.target.files.length > 0) callback(e.target.files[0]);
    });
}

setupDragAndDrop(pdfDropzone, pdfFileInput, (file) => {
    if (file.type !== "application/pdf") {
        showToast("Invalid file format. Please drop a valid PDF.", "error");
        return;
    }
    if (file.size > 50 * 1024 * 1024) {
        showToast("File size restriction exceeded (Max 50MB).", "error");
        return;
    }
    selectedPdfFile = file;
    pdfFileNameDisplay.innerHTML = `Selected: <span class="text-indigo-400 font-semibold">${file.name}</span> (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
});

setupDragAndDrop(thumbDropzone, thumbFileInput, (file) => {
    if (!file.type.startsWith("image/")) {
        showToast("Please drop a supported image file.", "error");
        return;
    }
    if (file.size > 2 * 1024 * 1024) {
        showToast("Thumbnail exceeds limit (Max 2MB).", "error");
        return;
    }
    selectedThumbFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        thumbPreviewContainer.style.backgroundImage = `url('${e.target.result}')`;
        thumbPreviewContainer.classList.remove('hidden');
        thumbPrompt.classList.add('opacity-0');
    };
    reader.readAsDataURL(file);
});

// ---------------- CLOUDINARY UPLOAD (real progress via XHR) ----------------
function uploadToCloudinary(file, onProgress) {
    return new Promise((resolve, reject) => {
        if (!file) { resolve(""); return; }

        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", UPLOAD_PRESET);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/raw/upload`);

        xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable && onProgress) {
                const pct = (e.loaded / e.total) * 100;
                onProgress(pct);
            }
        });

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const data = JSON.parse(xhr.responseText);
                    if (onProgress) onProgress(100);
                    resolve(data.secure_url);
                } catch (err) {
                    reject(new Error("Couldn't parse Cloudinary response."));
                }
            } else {
                console.error("Cloudinary error response:", xhr.responseText);
                reject(new Error(`Cloudinary upload failed (${xhr.status}). Check that PDF/raw uploads are allowed for your preset.`));
            }
        };

        xhr.onerror = () => reject(new Error("Network error while uploading to Cloudinary."));
        xhr.send(formData);
    });
}

// ---------------- FORM SUBMIT ----------------
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = document.getElementById('note-title').value.trim();
    const course = document.getElementById('note-course').value;
    const subject = document.getElementById('note-subject').value.trim();

    if (!title || !course || !subject) {
        showToast("Title, course, and subject are required.", "error");
        return;
    }
    if (!selectedPdfFile) {
        showToast("Please attach a PDF document.", "error");
        return;
    }

    submitBtn.disabled = true;
    progressContainer.classList.remove('hidden');

    try {
        // --- Upload PDF (maps to first 70% of the bar) ---
        progressStatusText.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin text-[10px]"></i> Uploading PDF...`;
        const pdfURL = await uploadToCloudinary(selectedPdfFile, (progress) => {
            const mapped = progress * 0.7;
            progressBar.style.width = `${mapped}%`;
            progressPercentage.innerText = `${Math.round(mapped)}%`;
        });

        // --- Upload thumbnail (maps to remaining 30%) ---
        let thumbnailURL = "";
        if (selectedThumbFile) {
            progressStatusText.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin text-[10px]"></i> Uploading thumbnail...`;
            thumbnailURL = await uploadToCloudinary(selectedThumbFile, (progress) => {
                const mapped = 70 + progress * 0.3;
                progressBar.style.width = `${mapped}%`;
                progressPercentage.innerText = `${Math.round(mapped)}%`;
            });
        } else {
            progressBar.style.width = `70%`;
            progressPercentage.innerText = `70%`;
        }

        // --- Save note metadata to Firestore ---
        progressStatusText.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin text-[10px]"></i> Saving to database...`;
        const notePayload = {
            title,
            description: document.getElementById('note-description').value.trim(),
            course,                                    // "Foundation" | "Intermediate" | "Final"
            subject,
            chapter: document.getElementById('note-chapter').value.trim() || "General",
            faculty: document.getElementById('note-faculty').value.trim() || "Academy Expert",
            pdfURL,
            thumbnailURL,
            premium: document.getElementById('note-premium').checked,
            status: document.getElementById('note-status').value, // "Published" | "Draft"
            downloads: 0,
            views: 0,
            createdAt: serverTimestamp(),
        };

        await addDoc(collection(db, "notes"), notePayload);

        progressBar.style.width = `100%`;
        progressPercentage.innerText = `100%`;
        showToast("Study resource published successfully!");
        resetForm();
    } catch (error) {
        console.error("Upload failed:", error);
        showToast(error.message || "Upload failed. Please try again.", "error");
    } finally {
        submitBtn.disabled = false;
        setTimeout(() => progressContainer.classList.add('hidden'), 1000);
    }
});

// --- Reset ---
function resetForm() {
    form.reset();
    selectedPdfFile = null;
    selectedThumbFile = null;
    pdfFileNameDisplay.innerHTML = DEFAULT_PDF_PROMPT;
    thumbPreviewContainer.classList.add('hidden');
    thumbPreviewContainer.style.backgroundImage = 'none';
    thumbPrompt.classList.remove('opacity-0');
    progressBar.style.width = '0%';
    progressPercentage.innerText = '0%';
}

clearBtn.addEventListener('click', resetForm);

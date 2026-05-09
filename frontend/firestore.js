import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

  const firebaseConfig = {
    apiKey: "AIzaSyA9sSSCsEW_XWsOpz1sGJtFIuEEDLSxaj8",
    authDomain: "cma-vidyarthi-3c892.firebaseapp.com",
    projectId: "cma-vidyarthi-3c892",
    storageBucket: "cma-vidyarthi-3c892.firebasestorage.app",
    messagingSenderId: "752274115998",
    appId: "1:752274115998:web:384d4cf2d36fdec126da8f",
    measurementId: "G-8P3QWMYSXY"
  };


const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

"use client";

import { useEffect } from "react";
import { startInstallCapture } from "@/lib/install";

/** Mounted once in the root layout so the browser's install prompt isn't missed. */
export default function InstallCapture() {
  useEffect(() => {
    startInstallCapture();
  }, []);
  return null;
}

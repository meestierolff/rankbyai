import type { Metadata } from "next";
import { ThanksClient } from "./thanks-client";

export const metadata: Metadata = { title: "Thank you" };

export default function ThanksPage() {
  return <ThanksClient />;
}

import { Metadata } from "next";
import PRTrackerClient from "./PRTrackerClient";

export const metadata: Metadata = {
  title: "PR Tracker — slime × miles",
  description: "Daily-updated PR analysis for RL training frameworks",
};

export default function PRTrackerPage() {
  return <PRTrackerClient />;
}

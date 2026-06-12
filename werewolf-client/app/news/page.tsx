import type {Metadata} from "next";
import NewsTimeline from "@/app/news/NewsTimeline";

export const metadata: Metadata = {
    title: "News — Werewolf AI",
    description: "Every new model, theme, and feature we ship to the table — newest first.",
};

export default function NewsPage() {
    return <NewsTimeline/>;
}

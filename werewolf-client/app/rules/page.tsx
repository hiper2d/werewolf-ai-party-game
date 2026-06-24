import {Suspense} from "react";
import type {Metadata} from "next";
import RulesTutorials from "@/app/rules/RulesTutorials";

export const metadata: Metadata = {
    title: "Rules — Werewolf AI",
    description: "How to play Werewolf AI — roles, night actions, phases, and strategy.",
};

export default function RulesPage() {
    return (
        <Suspense>
            <RulesTutorials/>
        </Suspense>
    );
}

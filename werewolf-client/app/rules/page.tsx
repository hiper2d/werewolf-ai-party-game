import {Suspense} from "react";
import {redirect} from "next/navigation";
import {auth} from "@/auth";
import RulesTutorials from "@/app/rules/RulesTutorials";

export default async function RulesPage() {
    const session = await auth();
    if (!session) {
        redirect('/?login=true&callbackUrl=%2Frules');
    }

    return (
        <Suspense>
            <RulesTutorials/>
        </Suspense>
    );
}

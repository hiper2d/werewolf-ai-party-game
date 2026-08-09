/**
 * Written rules for every role, in the wording players see on /rules.
 *
 * Kept out of the client component so server code (notably the /llms-full.txt
 * endpoint) can read the same text instead of paraphrasing it into a second,
 * drifting copy.
 */
export interface RoleDetail {
    name: string;
    team: 'village' | 'werewolf';
    nightOrder: string | null;
    body: string;
    oneTimeAbility?: string;
}

export const ROLE_DETAILS: RoleDetail[] = [
    {
        name: 'Werewolf',
        team: 'werewolf',
        nightOrder: 'Acts 2nd at night',
        body: 'The werewolves know each other. Each night they have a short private chat, then agree on one ' +
            'player to eliminate. If nobody saves the target, the target dies. During the day they blend in ' +
            'and vote like everyone else.',
    },
    {
        name: 'Maniac',
        team: 'village',
        nightOrder: 'Acts 1st at night',
        body: 'Picks any other alive player to abduct for the night. The abducted player cannot perform any ' +
            'actions and cannot be targeted by other players — all attempts fail. If the Maniac dies during ' +
            'the night, the abducted player dies too. Abducting a werewolf has no effect, unless it is the ' +
            'last alive werewolf — in that case the werewolf skips their turn. The Maniac wins with the ' +
            'village, but looks bad to the Detective’s investigation.',
    },
    {
        name: 'Doctor',
        team: 'village',
        nightOrder: 'Acts 3rd at night',
        body: 'Each night picks one alive player to heal, including themselves. The healed player cannot die ' +
            'that night for any reason. The Doctor cannot heal the same player two nights in a row.',
        oneTimeAbility: 'Doctor’s Mistake — once per game, the Doctor can kill a target instead of healing.',
    },
    {
        name: 'Detective',
        team: 'village',
        nightOrder: 'Acts 4th at night',
        body: 'Each night picks one alive player to investigate. The Game Master reveals whether the target is ' +
            'good or bad — without revealing names or giving hints. All villagers except the Maniac are good; ' +
            'all werewolves and the Maniac are bad.',
        oneTimeAbility: 'Detective’s Kill — once per game, the Detective can kill a target instead of investigating.',
    },
    {
        name: 'Villager',
        team: 'village',
        nightOrder: null,
        body: 'A regular villager with no special abilities. Their power is in the day phase — reading people, ' +
            'steering the debate, and voting wisely.',
    },
];

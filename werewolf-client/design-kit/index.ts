/**
 * Design-kit entry — the component surface synced to the "Werewolf AI — UI Kit"
 * design-system project on claude.ai/design (see /.design-sync/config.json).
 *
 * Hand-curated on purpose: only browser-safe presentational components belong
 * here. Anything importing server-only modules (server actions, auth,
 * firebase-admin) must be refactored to take those as props first — that is
 * why CharacterCard receives its actions via props.
 */
import './process-shim';

export { default as PlayerAvatar } from '@/app/components/PlayerAvatar';
export { default as CharacterPoster } from '@/app/games/[id]/components/CharacterPoster';
export { default as CharacterCard } from '@/app/games/[id]/components/CharacterCard';
export { default as RoleCard } from '@/app/games/[id]/components/RoleCard';
export { default as SelectDropdown } from '@/app/components/SelectDropdown';
export { default as MultiSelectDropdown } from '@/app/components/MultiSelectDropdown';
export { default as ModelSelectDropdown } from '@/app/components/ModelSelectDropdown';
export { default as AIModelSelect } from '@/app/components/AIModelSelect';
export { default as ExpandableTextarea } from '@/app/components/ExpandableTextarea';
export { default as IllustrationsPanel } from '@/app/games/newgame/components/IllustrationsPanel';
export { CheckIcon, DashIcon, ArrowIcon, InfoIcon, GoogleIcon, GithubIcon, DiscordIcon } from '@/app/components/ui-icons';
export { DesignPreviewProvider } from './preview-provider';

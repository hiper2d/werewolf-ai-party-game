import {welcomeNoteText} from "@/app/utils/welcome-note";

const base = {on: true, credits: 5, signupDenied: false, discordUSD: 5, discordClaimed: false};

describe('welcomeNoteText', () => {
    it('tells a guest who signed in that the game moved and what they have', () => {
        expect(welcomeNoteText('guest', {...base, credits: 4.9})).toEqual({
            title: 'You’re signed in.',
            body: 'Your game is saved to your account. You have $4.90 of free play.',
        });
    });
    it('greets a new account', () => {
        expect(welcomeNoteText('new', base).body).toBe('You have $5.00 of free play.');
    });
    it('explains a refused starting credit and points to the Discord claim', () => {
        const text = welcomeNoteText('guest', {...base, credits: 0, signupDenied: true});
        expect(text.body).toContain('did not get the free starting credit');
        expect(text.body).toContain('$5.00 free on our Discord');
        expect(text.profileLink).toBeDefined();
    });
    it('does not offer a Discord claim that was used', () => {
        const text = welcomeNoteText('guest', {...base, credits: 0, signupDenied: true, discordClaimed: true});
        expect(text.body).toBe('Your game is saved to your account. Your free play is used up.');
    });
    it('says nothing about money with credits off or unread', () => {
        expect(welcomeNoteText('guest', {...base, on: false}).body).toBe('Your game is saved to your account.');
        expect(welcomeNoteText('new', null).body).toBe('Pick a story to play your first game.');
    });
});

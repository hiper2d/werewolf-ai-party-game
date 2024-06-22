export class Game {
    id: string;
    name: string;
    description: string;

    constructor(id: string, name: string, description: string) {
        this.id = id;
        this.name = name;
        this.description = description;
    }

    static fromFirestore(id: string, data: any): Game {
        return new Game(id, data.name, data.description);
    }

    toFirestore(): {name: string, description: string} {
        return {
            name: this.name,
            description: this.description
        };
    }
}
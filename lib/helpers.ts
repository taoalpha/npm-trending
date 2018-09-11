export class DateHelper {
    static move(date: Date, days: number): Date {
        date.setDate(date.getDate() + days);
        return date;
    }

    static add(date: string, days: number): string {
        let d = new Date(date);
        d.setDate(d.getDate() + days);
        return d.toISOString().split("T")[0];
    }

    static compare(dateA: string, dateB: string): -1 | 0 | 1 {
        let dA = new Date(dateA);
        let dB = new Date(dateB);

        if (dA === dB) return 0;
        if (dA > dB) return 1;
        else return -1;
    }

    static getDateString(date: string | Date) : string {
        return new Date(date).toUTCString().replace(" 00:00:00 GMT", "");
    }

    static today: string = new Date().toISOString().split("T")[0];
}
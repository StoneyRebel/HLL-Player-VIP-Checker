class ContestService {
    constructor(database, crcon) {
        this.database = database;
        this.crcon = crcon;
        this.currentContest = null;
    }

    async getCurrentContest() {
        return this.currentContest;
    }

    async createContest(contestData) {
        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + (contestData.durationHours * 60 * 60 * 1000));

        const contest = {
            id: `contest_${Date.now()}`,
            title: contestData.title,
            description: contestData.description,
            prize: contestData.prize,
            maxWinners: contestData.maxWinners,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            createdBy: contestData.createdBy,
            active: true
        };

        this.currentContest = contest;
        return contest;
    }
}

module.exports = ContestService;

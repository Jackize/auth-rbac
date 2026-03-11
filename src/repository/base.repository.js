class BaseRepository {
    constructor(model) {
        this.model = model;
    }

    async findById(id, options = {}) {
        return this.model.findUnique({
            where: { id },
            ...options
        });
    }

    async findMany(query = {}, options = {}) {
        return this.model.findMany({
            where: query,
            ...options
        });
    }

    async create(data) {
        return this.model.create({ data });
    }

    async update(id, data) {
        return this.model.update({
            where: { id },
            data
        });
    }

    async delete(id) {
        return this.model.delete({
            where: { id }
        });
    }
}

export default BaseRepository;
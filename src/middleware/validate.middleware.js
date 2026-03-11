const validate = (schema) => (req, res, next) => {
    const result = schema.safeParse(req.body || req.query || req.params);

    const errorData = []
    for (const issue of result?.error?.issues || []) {
        errorData.push({
            field: issue.path.join("."),
            message: issue.message,
        });
    }

    if (!result.success) {
        return res.status(400).json({ error: "Invalid input", details: errorData });
    }
    req.validated = result.data;
    next();
};

export { validate };

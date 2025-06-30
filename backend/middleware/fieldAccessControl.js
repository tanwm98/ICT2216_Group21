function filterFields(data, allowedFields = []) {
    if (Array.isArray(data)) {
        return data.map(item => filterFields(item, allowedFields));
    }

    const filtered = {};
    for (const field of allowedFields) {
        if (field in data) filtered[field] = data[field];
    }
    return filtered;
}

function fieldLevelAccess(allowedFieldsByRole) {
    return (req, res, next) => {
        res.filterData = (data) => {
            const role = req.user?.role || 'guest';
            const allowedFields = allowedFieldsByRole[role] || [];
            return filterFields(data, allowedFields);
        };
        next();
    };
}

module.exports = {
    fieldLevelAccess
};

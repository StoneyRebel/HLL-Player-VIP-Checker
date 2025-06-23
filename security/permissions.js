class PermissionChecker {
    static hasAdminPermissions(member) {
        return member.permissions.has('Administrator') || 
               member.permissions.has('ManageGuild');
    }
}

module.exports = PermissionChecker;

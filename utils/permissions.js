class PermissionChecker {
    static hasAdminPermissions(member) {
        return member.permissions.has('Administrator') || 
               member.permissions.has('ManageGuild');
    }

    static hasModeratorPermissions(member) {
        return member.permissions.has('ModerateMembers') ||
               member.permissions.has('ManageMessages') ||
               this.hasAdminPermissions(member);
    }

    static hasVipManagerPermissions(member) {
        return member.permissions.has('ManageRoles') ||
               this.hasAdminPermissions(member);
    }

    static canUseCommand(member, requiredPermission) {
        switch (requiredPermission) {
            case 'admin':
                return this.hasAdminPermissions(member);
            case 'moderator':
                return this.hasModeratorPermissions(member);
            case 'vip_manager':
                return this.hasVipManagerPermissions(member);
            default:
                return true; // Public command
        }
    }

    static checkPermissionLevel(member) {
        if (this.hasAdminPermissions(member)) {
            return 'admin';
        } else if (this.hasModeratorPermissions(member)) {
            return 'moderator';
        } else if (this.hasVipManagerPermissions(member)) {
            return 'vip_manager';
        } else {
            return 'user';
        }
    }
}

module.exports = PermissionChecker;

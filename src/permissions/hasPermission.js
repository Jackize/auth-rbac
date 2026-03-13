export const hasPermission = (userPermissions, requiredPermission) => {
  // full admin
  if (userPermissions.includes("*")) {
    return true;
  }

  // exact permission
  if (userPermissions.includes(requiredPermission)) {
    return true;
  }

  const [resource, action] = requiredPermission.split(":");

  // wildcard resource
  if (userPermissions.includes(`*:${action}`)) {
    return true;
  }

  // wildcard action
  if (userPermissions.includes(`${resource}:*`)) {
    return true;
  }

  return false;
};

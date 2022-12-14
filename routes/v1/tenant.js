'use strict'
/** @module routes/v1/tenant */

/**
 * @requires config - Require config wich includes main environment configuration
 * @requires multipart - Require multiparty module wich handles uploading functionality
 * @requires access - Require access middlewayre wich handle permissions before controller excecution
 * @requires TenantController - Require Tenant controller to link functionality
 */
const config = require('config');
const multipart = require('connect-multiparty');
const access = require('../../middlewares/permissions');
const tenantsController = require('../../controllers/tenant.js');

/** @const {middleware} multipartMiddleware - configure upload directory middleware */
const multipartMiddleware = multipart({ uploadDir: config.upload_dir_tmp });

/** Exports all routing functions to be used inside main app routing */
module.exports = function(router) {

    /**
     * Route serving all tenants list.
     * @name get/tenants
     * @middleware [access:permit]
     * @function
     * @memberof module:controllers/tenant
     * @inner
     * @param {string} path - Express path
     * @param {function} getAllTenants - Catalog controller function.
     */
    router.get('/tenants', access.permit('admin-tenant-read'),  tenantsController.getAllTenants);

    /**
     * Route serving single tenant info with details.
     * @name get/tenants/:id
     * @middleware [access:permit]
     * @function
     * @memberof module:controllers/tenant
     * @inner
     * @param {string} path - Express path
     * @param {function} getTenantById - Catalog controller function.
     */
    router.get('/tenants/:id', access.permit('admin-tenant-read'),  tenantsController.getTenantById);

    /**
     * Route serving single tenant creation.
     * @name post/tenants
     * @middleware [access:permit]
     * @function
     * @memberof module:controllers/tenant
     * @inner
     * @param {string} path - Express path
     * @param {function} createTenant - Catalog controller function.
     */
    router.post('/tenants', access.permit('admin-tenant-create'),  tenantsController.createTenant);

    /**
     * Route serving single tenant updating by tenant ID.
     * @name patch/tenants/:id
     * @middleware [access:permit]
     * @function
     * @memberof module:controllers/tenant
     * @inner
     * @param {string} path - Express path
     * @param {function} updateTenantById - Catalog controller function.
     */
    router.patch('/tenants/:id', access.permit('admin-tenant-update'),  tenantsController.updateTenantById);

    /**
     * Route serving single tenant avatar updating by tenant ID.
     * @name patch/tenants/:id/avatar
     * @middleware [access:permit, multipartMiddleware]
     * @function
     * @memberof module:controllers/tenant
     * @inner
     * @param {string} path - Express path
     * @param {function} updateTenantAvatarById - Catalog controller function.
     */
    router.patch('/tenants/:id/avatar', [access.permitAny(['admin-tenant-create','admin-tenant-update']),multipartMiddleware],  tenantsController.updateTenantAvatarById);

    /**
     * Route serving for deleting tenant by ID.
     * @name delete/tenants/:id
     * @middleware [access:permit]
     * @function
     * @memberof module:controllers/tenant
     * @inner
     * @param {string} path - Express path
     * @param {function} deleteTenantById - Catalog controller function.
     */
    router.delete('/tenants/:id', access.permit('admin-tenant-delete'),  tenantsController.deleteTenantById);


    /**
     * Route serving all permissions list, common for all tenants.
     * @name get/permissions
     * @middleware [access:permit]
     * @function
     * @memberof module:controllers/tenant
     * @inner
     * @param {string} path - Express path
     * @param {function} getPermissions - Catalog controller function.
     */
    router.get('/permissions', access.permit('admin-tenant-read'), tenantsController.getPermissions);

    /**
     * Route serving all roles list by tenant ID.
     * @name get/tenants/:tenant/roles
     * @middleware [access:permit]
     * @function
     * @memberof module:controllers/tenant
     * @inner
     * @param {string} path - Express path
     * @param {function} getRoles - Catalog controller function.
     */
    router.get('/tenants/:tenant/roles', access.permitAny(['admin-roles-read','admin-users-read','admin-users-create','admin-users-update']), tenantsController.getRoles);

    /**
     * Route serving creation for a role by tenant ID.
     * @name post/tenants/:tenant/roles
     * @middleware [access:permit]
     * @function
     * @memberof module:controllers/tenant
     * @inner
     * @param {string} path - Express path
     * @param {function} addRole - Catalog controller function.
     */
    router.post('/tenants/:tenant/roles/', access.permit('admin-roles-create'), tenantsController.addRole);

    /**
     * Route serving single role with details by tenand IT and role ID.
     * @name get/tenants/:tenant/roles/:id
     * @middleware [access:permit]
     * @function
     * @memberof module:controllers/tenant
     * @inner
     * @param {string} path - Express path
     * @param {function} getRoleById - Catalog controller function.
     */
    router.get('/tenants/:tenant/roles/:id', access.permit('admin-roles-read'), tenantsController.getRoleById);

    /**
     * Route serving single role updating by tenant IT and role ID.
     * @name patch/tenants/:tenant/roles/:id
     * @middleware [access:permit]
     * @function
     * @memberof module:controllers/tenant
     * @inner
     * @param {string} path - Express path
     * @param {function} updateRoleById - Catalog controller function.
     */
    router.patch('/tenants/:tenant/roles/:id', access.permit('admin-roles-update'), tenantsController.updateRoleById);

    /**
     * Route serving single role deleting by tenant IT and role ID.
     * @name delete/tenants/:tenant/roles/:id
     * @middleware [access:permit]
     * @function
     * @memberof module:controllers/tenant
     * @inner
     * @param {string} path - Express path
     * @param {function} deleteRoleById - Catalog controller function.
     */
    router.delete('/tenants/:tenant/roles/:id', access.permit('admin-roles-delete'), tenantsController.deleteRoleById);


}
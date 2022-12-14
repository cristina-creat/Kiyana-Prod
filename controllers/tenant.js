const config = require('config');
const fs = require('fs');
const Tenant = require("../models/tenant");
const jwt = require('../services/jwt');
var UserPermission = require('../models/user_permission');
var UserRole = require('../models/user_role');
var getSlug = require('speakingurl');
//const common = require("../services/common");

/***************************************
 *
 *
 *	Permisions function
 *
 *
 ***************************************/

 const getPermissions = (req, res) => {
  /**
   * Return a list of user permisions
   *
   * returns List
   **/
  UserPermission.find({}).sort({ name: 1 }).exec((err, data) => {
      res.send({ data: data });
  });
}

const addPermission = (req, res, next) => {
  /**
   * Creates a new permission.
   *
   * slug Permission 
   * returns Permission
   **/

  var permission = new UserPermission();
  var params = req.body;
  if (!params.name)
      res.send({ message: 'Field "name" is required' });
  permission.name = params.name;
  permission.slug = (params.slug) ? getSlug(params.slug) : getSlug(params.name);

  permission.save((err, permissionStored) => {
      if (err) {
          next({ status: 200, message: 'Permission already exists.' });
      } else {
          if (permissionStored)
              res.send(permissionStored);
          else {
              next({ status: 200, message: 'Error saving permission.' });
          }
      }
  });

}

const deletePermissionById = (req, res, next) => {
  /**
   * Delete permission.
   *
   * id Long ID of th permission to delete
   * no response value expected for this operation
   **/

  UserPermission.remove({ _id: req.params.id }, (err, permissionRemoved) => {
      if (err) {
          next({ status: 200, message: 'Permission doesnt exists.' });
      } else {
          if (permissionRemoved)
              res.send(permissionRemoved);
          else {
              next({ status: 200, message: 'Error deleting permission.' });
          }
      }
  });

}

/***************************************
*
*
*	Roles functions
*
*
***************************************/

const getRoles = (req, res) => {
  /**
   * Return a list of user permisions
   *
   * returns List
   **/
  UserRole.find({ _tenant: req.params.tenant }).exec(function(err, data) {
      res.send({ data: data });
  });
}

const addRole = (req, res, next) => {
  /**
   * Creates a new permission.
   *
   * slug Permission 
   * returns Permission
   **/
  var role = new UserRole();
  var params = req.body;
  if (!params.name)
      res.send({ message: 'Field "name" is required' });
  role.name = params.name;
  role.slug = (params.slug) ? req.tenant + getSlug(params.slug) : req.tenant + getSlug(params.name);
  role.permissions = params.permissions;
  role._tenant = req.params.tenant;

  role.save((err, roleStored) => {
      if (err) {
          next({ status: 200, message: 'Role already exists.', error: err });
      } else {
          if (roleStored)
              res.send(roleStored);
          else {
              next({ status: 200, message: 'Error saving role.' });
          }
      }
  });
}

const getRoleById = (req, res, next) => {
  /**
   * Return a list of user roles
   *
   * id Long Id of the role to retrive information
   * returns Role
   **/
  UserRole.findById(req.params.id).exec((err, role) => {
      if (err) {
          next({ status: 200, message: 'Role doesnt exists.' });
      } else {
          if (role)
              res.send(role);
          else {
              next({ status: 200, message: 'Error retriving role.' });
          }
      }
  });

}

const updateRoleById = (req, res, next) => {
  /**
   * Update permission.
   *
   * id Long ID of the permission to update
   * returns Role
   **/
  var role = {};
  var params = req.body;
  if (!params.name)
      res.send({ message: 'Field "name" is required' });
  role.name = params.name;
  role.slug = (params.slug) ? req.tenant + getSlug(params.slug) : req.tenant + getSlug(params.name);
  role.permissions = params.permissions;

  UserRole.findOneAndUpdate({_id: req.params.id}, { $set: role }, { new: true }).exec((err, role) => {
      if (err) {
          next({ status: 200, message: 'Role doesnt exists.', error: err });
      } else {
          if (role)
              res.send(role);
          else {
              next({ status: 200, message: 'Error updating role.' });
          }
      }
  });

}

const deleteRoleById = (req, res, next) => {
  /**
   * Deleted permission.
   *
   * id Long ID of the permission to delete
   * returns Role
   **/
  UserRole.remove({ _tenant: req.tenant, _id: req.params.id }, (err, roleRemoved) => {
      if (err) {
          next({ status: 200, message: 'Role doesnt exists.' });
      } else {
          if (roleRemoved)
              res.send(roleRemoved);
          else {
              next({ status: 200, message: 'Error deleting role.' });
          }
      }
  });

}


const getAllTenants = (req, res) => {
  Tenant.find({}).exec((err, data) => {
    if ( err ) {
      next({ status: 500, message: 'Error loading tenant.', error: err });
    } else {
      let tenants = data;
      // Generate token if user is admin
      if ( req.user.role == config.roles.admin ) {
        tenants = tenants.map( tn => {
          tn = tn.toObject();
          tn.token = jwt.createToken({
            _user: req.user._id,
            _tenant: tn._id,
            key: req.user.secret_key
        });;
          return tn;
        })
      }
      res.send({
        data: tenants
      });
    }
  });
};


const getTenantById = (req, res, next)=>{
  const {id} = req.params;
  Tenant.findById(id).exec((err, tenant) => {
    if (err) {
        next({ status: 200, message: 'tenant doesnt exists.' });
    } else {
        if (tenant)
            res.json(tenant);
        else {
            next({ status: 200, message: 'Error retriving tenant.' });
        }
    }
});
}

const createTenant = (req, res, next) => {
  const tenant = new Tenant();
  const params = req.body;
  Object.keys(params).forEach((key) => {
    if ( params[key] ) {
      tenant[key] = params[key];
    }
  });
  tenant.save((err, userStored) => {
    if (err) {
      next({ status: 200, message: "La empresa ya existe.", error: err });
    } else {
      console.log( userStored)
      if (userStored) res.send(userStored);
      else {
        next({ status: 200, message: "Error al guardar la información." });
      }
    }
  });
};

const updateTenantById = (req, res, next)=>{
    let tenant = {};
    const data = req.body;
    const {id} = req.params;
    
    Object.keys(data).forEach(key => {
        tenant[key] = data[key];
    });

    Tenant.findByIdAndUpdate(id, { $set: tenant }, { new: true }).exec((err, tenant) => {
        if (err) {
            next({ status: 200, message: 'Error updating tenant.', error: err });
        } else {
            if (tenant)
                res.send(tenant);
            else {
                next({ status: 200, message: 'Error updating tenant.' });
            }
        }
    });
}

const updateTenantAvatarById = (req, res, next) => {
  /**
   * Update tenant.
   *
   * id Long ID of th tenant to update
   * returns Tenant
   **/
  
  if (!req.files || !req.files.avatar) {
      next({ status: 200, message: 'File "avatar" is required.', error: 'Not file uploaded' });
      return;
  }

   var filepath = req.files.avatar.path;
   var upload_tmp = config.upload_dir_tmp.replace('./', '');
   var filename = filepath.replace(upload_tmp, '');
   filepath = config.upload_avatar_dir + filename;
   fs.renameSync(req.files.avatar.path, filepath);
   
  Tenant.findByIdAndUpdate(req.params.id, { $set: { img: filename } }, { new: true }).exec((err, tenant) => {
      if (err) {
          next({ status: 200, message: 'Error updating tenant.', error: err });
      } else {
          if (tenant)
              res.send(tenant);
          else {
              next({ status: 200, message: 'Error updating tenant.' });
          }
      }
  });
  
}

const deleteTenantById = (req, res, next)=>{
  Tenant.remove({ _id: req.params.id }, (err, TenantRemoved) => {
    if (err) {
        next({ status: 200, message: 'Tenant doesnt exists.' });
    } else {
        if (TenantRemoved)
            res.json(TenantRemoved);
        else {
            next({ status: 200, message: 'Error deleting Tenant.' });
        }
    }
});
}



module.exports = {
  getPermissions,
  addPermission,
  deletePermissionById,
  getRoles,
  addRole,
  getRoleById,
  updateRoleById,
  deleteRoleById,

  getAllTenants,
  createTenant,
  updateTenantById,
  updateTenantAvatarById,
  getTenantById,
  deleteTenantById
};

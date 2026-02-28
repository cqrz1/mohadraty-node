const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Admin = sequelize.define(
  'admins',
  {
    admin_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
      autoIncrement: true
    },
    admin_name: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    role: {
      type: DataTypes.ENUM('owner', 'assistant_owner', 'manager', 'admin'),
      allowNull: false,
      defaultValue: 'admin'
    }
  },
  { tableName: 'admins', timestamps: false }
);

const Student = sequelize.define(
  'students',
  {
    student_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
      autoIncrement: false
    },
    student_name: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    academic_year: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    major: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    student_photo: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    admin_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  },
  { tableName: 'students', timestamps: false }
);

const Professor = sequelize.define(
  'professors',
  {
    professor_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
      autoIncrement: true
    },
    professor_name: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    subject_name: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    professor_photo: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    academic_year: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    major: {
      type: DataTypes.STRING(255),
      allowNull: true
    }
  },
  { tableName: 'professors', timestamps: false }
);

const ProfessorTeachingScope = sequelize.define(
  'professor_teaching_scopes',
  {
    scope_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
      autoIncrement: true
    },
    professor_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    academic_year: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    major: {
      type: DataTypes.STRING(100),
      allowNull: false
    }
  },
  { tableName: 'professor_teaching_scopes', timestamps: false }
);

const Lecture = sequelize.define(
  'lectures',
  {
    lecture_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
      autoIncrement: true
    },
    lecture_name: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    lecture_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    lecture_file: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    professor_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  },
  { tableName: 'lectures', timestamps: false }
);

const Sheet = sequelize.define(
  'sheets',
  {
    sheet_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
      autoIncrement: true
    },
    sheet_name: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    sheet_date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    sheet_file: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    professor_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  },
  { tableName: 'sheets', timestamps: false }
);

const AdminAuditLog = sequelize.define(
  'admin_audit_logs',
  {
    log_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
      autoIncrement: true
    },
    actor_admin_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    target_type: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    target_id: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    details: {
      type: DataTypes.STRING(1000),
      allowNull: true
    },
    ip_address: {
      type: DataTypes.STRING(64),
      allowNull: true
    },
    user_agent: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: sequelize.literal('GETDATE()')
    }
  },
  { tableName: 'admin_audit_logs', timestamps: false }
);

Admin.hasMany(Student, { foreignKey: 'admin_id' });
Student.belongsTo(Admin, { foreignKey: 'admin_id' });

Professor.hasMany(Lecture, { foreignKey: 'professor_id' });
Lecture.belongsTo(Professor, { foreignKey: 'professor_id' });

Professor.hasMany(Sheet, { foreignKey: 'professor_id' });
Sheet.belongsTo(Professor, { foreignKey: 'professor_id' });

Professor.hasMany(ProfessorTeachingScope, {
  foreignKey: 'professor_id',
  as: 'teachingScopes'
});
ProfessorTeachingScope.belongsTo(Professor, {
  foreignKey: 'professor_id',
  as: 'professor'
});

Admin.hasMany(AdminAuditLog, { foreignKey: 'actor_admin_id' });
AdminAuditLog.belongsTo(Admin, { foreignKey: 'actor_admin_id' });

module.exports = {
  sequelize,
  Admin,
  Student,
  Professor,
  ProfessorTeachingScope,
  Lecture,
  Sheet,
  AdminAuditLog
};

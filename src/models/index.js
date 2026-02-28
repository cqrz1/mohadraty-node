const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Admin = sequelize.define(
  'admins',
  {
    admin_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
      autoIncrement: false
    },
    admin_name: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    role: {
      type: DataTypes.ENUM('superadmin', 'admin'),
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
      type: DataTypes.STRING(50),
      allowNull: true
    },
    major: {
      type: DataTypes.STRING(100),
      allowNull: true
    }
  },
  { tableName: 'professors', timestamps: false }
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

Admin.hasMany(Student, { foreignKey: 'admin_id' });
Student.belongsTo(Admin, { foreignKey: 'admin_id' });

Professor.hasMany(Lecture, { foreignKey: 'professor_id' });
Lecture.belongsTo(Professor, { foreignKey: 'professor_id' });

Professor.hasMany(Sheet, { foreignKey: 'professor_id' });
Sheet.belongsTo(Professor, { foreignKey: 'professor_id' });

module.exports = {
  sequelize,
  Admin,
  Student,
  Professor,
  Lecture,
  Sheet
};

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'
const prisma = new PrismaClient()

async function main(): Promise<void> {
  // Seed default admin user (idempotent)
  const adminEmail = 'admin@orst.go.th';
  const adminPlainPassword = 'ChangeMe!2025'; // โปรดเปลี่ยนหลังรัน seed ครั้งแรก
  const adminPasswordHash = await bcrypt.hash(adminPlainPassword, 10);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      username: 'admin',
      firstName: 'System',
      lastName: 'Administrator',
      password: adminPasswordHash,
      // name: 'System Administrator',
      // role: 'ADMIN',
    },
  });

  console.log('✅ Admin user ensured:', adminEmail);
  // 1. คอมพิวเตอร์และเทคโนโลยีสารสนเทศ
  await prisma.specializedDictionary.createMany({
    data: [
      {
        title: "พจนานุกรมศัพท์คอมพิวเตอร์",
        category: "คอมพิวเตอร์และเทคโนโลยีสารสนเทศ",
        subcategory: "คอมพิวเตอร์"
      },
      {
        title: "พจนานุกรมศัพท์เทคโนโลยีสารสนเทศ",
        category: "คอมพิวเตอร์และเทคโนโลยีสารสนเทศ",
        subcategory: "เทคโนโลยีสารสนเทศ"
      }
    ]
  })

  // 2. วิทยาศาสตร์ (กลุ่มนี้แยกย่อยมากที่สุด)
  await prisma.specializedDictionary.createMany({
    data: [
      { title: "พจนานุกรมศัพท์เคมี", category: "วิทยาศาสตร์", subcategory: "เคมี" },
      { title: "พจนานุกรมศัพท์ฟิสิกส์", category: "วิทยาศาสตร์", subcategory: "ฟิสิกส์" },
      { title: "พจนานุกรมศัพท์ชีววิทยา", category: "วิทยาศาสตร์", subcategory: "ชีววิทยา" },
      { title: "พจนานุกรมศัพท์วิทยาศาสตร์สิ่งแวดล้อม", category: "วิทยาศาสตร์", subcategory: "วิทยาศาสตร์สิ่งแวดล้อม" },
      { title: "พจนานุกรมศัพท์คณิตศาสตร์", category: "วิทยาศาสตร์", subcategory: "คณิตศาสตร์" },
      { title: "พจนานุกรมศัพท์ดาราศาสตร์", category: "วิทยาศาสตร์", subcategory: "ดาราศาสตร์" },
      { title: "พจนานุกรมศัพท์ธรณีวิทยา", category: "วิทยาศาสตร์", subcategory: "ธรณีวิทยา" },
      { title: "พจนานุกรมศัพท์วิทยาศาสตร์การแพทย์", category: "วิทยาศาสตร์", subcategory: "วิทยาศาสตร์การแพทย์" },
      { title: "พจนานุกรมศัพท์วิทยาศาสตร์ทางทะเล", category: "วิทยาศาสตร์", subcategory: "วิทยาศาสตร์ทางทะเล" },
      { title: "พจนานุกรมศัพท์พฤกษศาสตร์", category: "วิทยาศาสตร์", subcategory: "พฤกษศาสตร์" },
      { title: "พจนานุกรมศัพท์สัตวศาสตร์", category: "วิทยาศาสตร์", subcategory: "สัตวศาสตร์" },
      { title: "พจนานุกรมศัพท์วิทยาศาสตร์การเกษตร", category: "วิทยาศาสตร์", subcategory: "วิทยาศาสตร์การเกษตร" },
      { title: "พจนานุกรมศัพท์เทคโนโลยีอาหาร", category: "วิทยาศาสตร์", subcategory: "เทคโนโลยีอาหาร" }
    ]
  })

  // 3. พลังงาน
  await prisma.specializedDictionary.create({
    data: {
      title: "พจนานุกรมศัพท์พลังงาน",
      category: "พลังงาน",
      subcategory: null
    }
  })

  // 4. เทคโนโลยีทางภาพ
  await prisma.specializedDictionary.create({
    data: {
      title: "พจนานุกรมศัพท์เทคโนโลยีทางภาพ",
      category: "เทคโนโลยีทางภาพ",
      subcategory: null
    }
  })

  // 5. ยานยนต์และเครื่องยนต์
  await prisma.specializedDictionary.create({
    data: {
      title: "พจนานุกรมศัพท์ยานยนต์และเครื่องยนต์",
      category: "ยานยนต์และเครื่องยนต์",
      subcategory: null
    }
  })

  // 6. เศรษฐศาสตร์
  await prisma.specializedDictionary.create({
    data: {
      title: "พจนานุกรมศัพท์เศรษฐศาสตร์",
      category: "เศรษฐศาสตร์",
      subcategory: null
    }
  })

  // 7. นิติศาสตร์
  await prisma.specializedDictionary.createMany({
    data: [
      {
        title: "พจนานุกรมศัพท์นิติศาสตร์",
        category: "นิติศาสตร์",
        subcategory: "นิติศาสตร์"
      },
      {
        title: "พจนานุกรมศัพท์รัฐศาสตร์",
        category: "นิติศาสตร์",
        subcategory: "รัฐศาสตร์"
      }
    ]
  })

  // 8. ภูมิศาสตร์
  await prisma.specializedDictionary.createMany({
    data: [
      {
        title: "พจนานุกรมศัพท์ภูมิศาสตร์กายภาพ",
        category: "ภูมิศาสตร์",
        subcategory: "ภูมิศาสตร์กายภาพ"
      },
      {
        title: "พจนานุกรมศัพท์ภูมิศาสตร์มนุษย์",
        category: "ภูมิศาสตร์",
        subcategory: "ภูมิศาสตร์มนุษย์"
      }
    ]
  })

  // 9. ประกันภัย
  await prisma.specializedDictionary.create({
    data: {
      title: "พจนานุกรมศัพท์ประกันภัย",
      category: "ประกันภัย",
      subcategory: null
    }
  })

  // 10. สังคมวิทยา
  await prisma.specializedDictionary.createMany({
    data: [
      {
        title: "พจนานุกรมศัพท์สังคมวิทยา",
        category: "สังคมวิทยา",
        subcategory: "สังคมวิทยา"
      },
      {
        title: "พจนานุกรมศัพท์มานุษยวิทยา",
        category: "สังคมวิทยา",
        subcategory: "มานุษยวิทยา"
      }
    ]
  })

  // 11. ภาษาศาสตร์ทั่วไป
  await prisma.specializedDictionary.create({
    data: {
      title: "พจนานุกรมศัพท์ภาษาศาสตร์",
      category: "ภาษาศาสตร์ทั่วไป",
      subcategory: "ภาษาศาสตร์"
    }
  })

  // 12. ภาษาศาสตร์ประยุกต์
  await prisma.specializedDictionary.createMany({
    data: [
      {
        title: "พจนานุกรมศัพท์ภาษาศาสตร์ประยุกต์",
        category: "ภาษาศาสตร์ประยุกต์",
        subcategory: "ภาษาศาสตร์ประยุกต์"
      },
      {
        title: "พจนานุกรมศัพท์การแปลและล่าม",
        category: "ภาษาศาสตร์ประยุกต์",
        subcategory: "การแปลและล่าม"
      }
    ]
  })

  // 13. ศิลปะ
  await prisma.specializedDictionary.createMany({
    data: [
      {
        title: "พจนานุกรมศัพท์ศิลปะ",
        category: "ศิลปะ",
        subcategory: "ศิลปะ"
      },
      {
        title: "พจนานุกรมศัพท์สถาปัตยกรรม",
        category: "ศิลปะ",
        subcategory: "สถาปัตยกรรม"
      }
    ]
  })

  // 14. วรรณกรรม
  await prisma.specializedDictionary.createMany({
    data: [
      {
        title: "พจนานุกรมศัพท์วรรณกรรม",
        category: "วรรณกรรม",
        subcategory: "วรรณกรรม"
      },
      {
        title: "พจนานุกรมศัพท์วรรณคดี",
        category: "วรรณกรรม",
        subcategory: "วรรณคดี"
      }
    ]
  })

  // 15. สถาปัตยกรรมศาสตร์
  await prisma.specializedDictionary.create({
    data: {
      title: "พจนานุกรมศัพท์สถาปัตยกรรม",
      category: "สถาปัตยกรรมศาสตร์",
      subcategory: "สถาปัตยกรรม"
    }
  })

  console.log('🎉 Specialized dictionary seed completed!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

<script setup>
import { ref, onMounted, watch } from 'vue'
import windFarm from '@/components/overview/windFarm.vue'
import warning from '@/components/overview/warning.vue'
import { ElMessage } from 'element-plus'
import { getWarnList, getTurbineWarnList, getFarmInfo } from '@/api/overview'
import { getCompany, getWindFarmList } from '@/api/company'

// 公司相关变量
const companyId = ref(Number(sessionStorage.getItem('companyId')) || null)
const companyList = ref([])

// 获取公司列表
const getCompanyList = async () => {
  try {
    const response = await getCompany()
    companyList.value = response.data.result
    return response
  } catch (error) {
    console.error('获取公司数据失败:', error)
  }
}

// 风场选择相关
const windFarmId = ref(0)
const windFarmList = ref([])

// 时间选择相关
const startDate = ref(null)
const endDate = ref(null)

//预警相关
const warningList = ref([])
const totalCount = ref(0)
const page = ref(1)
const pageSize = ref(8)
const totalPages = ref(0)

// 格式化日期为字符串
const formatDate = (date) => {
  if (!date) return null
  const d = new Date(date)
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0') +
    ' ' +
    String(d.getHours()).padStart(2, '0') +
    ':' +
    String(d.getMinutes()).padStart(2, '0') +
    ':' +
    String(d.getSeconds()).padStart(2, '0')
  )
}

// 获取当前时间
const getCurrentTime = () => {
  return new Date()
}

// 获取指定天数前的时间
const getDateBefore = (days) => {
  const currentDate = new Date()
  currentDate.setDate(currentDate.getDate() - days)
  return currentDate
}

// 初始化默认时间范围为最近7天
const initDefaultTimeRange = () => {
  endDate.value = formatDate(getCurrentTime())
  startDate.value = formatDate(getDateBefore(7))
}

// 最近7天按钮处理
const handleRecentSevenDays = () => {
  endDate.value = formatDate(getCurrentTime())
  startDate.value = formatDate(getDateBefore(7))
}

// 最近30天按钮处理
const handleRecentThirtyDays = () => {
  endDate.value = formatDate(getCurrentTime())
  startDate.value = formatDate(getDateBefore(30))
}

// 时间选择器限制
const disabledDate = (time) => {
  // 结束时间不能超过当前时间
  return time > getCurrentTime()
}

// 监听开始时间变化，确保开始时间不超过结束时间
const validateStartDate = (val) => {
  if (endDate.value && new Date(val) > new Date(endDate.value)) {
    ElMessage.error('开始时间不能晚于结束时间')
    startDate.value = null
  }
}

// 监听结束时间变化，确保结束时间不早于开始时间
const validateEndDate = (val) => {
  if (startDate.value && new Date(val) < new Date(startDate.value)) {
    ElMessage.error('结束时间不能早于开始时间')
    endDate.value = null
  }
}
const getWindFarm = async () => {
  try {
    if (!companyId.value) return
    const params = { companyId: companyId.value }
    const response = await getWindFarmList(params)
    // 在列表开头添加全部场站选项
    windFarmList.value = [{ windFarmId: -1, windFarmName: '全部场站' }, ...response.data.result]
    // 设置默认选中全部场站
    windFarmId.value = -1
    return response
  } catch (error) {
    console.error('获取风场数据失败:', error)
  }
}

const getWarningData = async () => {
  try {
    const params = {
      page: page.value,
      page_size: pageSize.value,
      start_date: startDate.value,
      end_date: endDate.value,
      company_id: companyId.value
    }
    if (windFarmId.value != -1) {
      params.windfarm_id = windFarmId.value
    }

    const response = await getWarnList(params)
    const data = response.data.result
    warningList.value = data.warningList

    // 获取风场名并拼接
    // 提取所有唯一turbineId
    const turbineIds = [...new Set(warningList.value.map((item) => item.turbineId))]

    // 并发获取风场信息
    const farmRequests = turbineIds.map((turbineId) => getFarmInfo({ turbineId: turbineId }))
    const farmResponses = await Promise.all(farmRequests)

    // 构建turbineId到风场名的映射
    const turbineToFarmMap = {}
    farmResponses.forEach((res, index) => {
      const turbineId = turbineIds[index]
      if (res.data && res.data.result) {
        turbineToFarmMap[turbineId] = res.data.result.windFarmName
      }
    })

    // 更新warningList添加farmTurbineName
    warningList.value = warningList.value.map((item) => ({
      ...item,
      farmTurbineName: `${turbineToFarmMap[item.turbineId]}${item.turbineName}`
    }))

    totalCount.value = data.total_count
    page.value = data.page
    totalPages.value = data.total_pages
  } catch (error) {
    console.error('获取预警数据失败:', error)
  }
}

//风机矩阵相关
const turbineWarnList = ref([])

// const getTurbineWarnData = async () => {
//   try {
//     const params = {
//       windFarmId: windFarmId.value,
//       startDate: formatDate(startDate.value),
//       endDate: formatDate(endDate.value)
//       // startDate: '2024-11-06 15:43:30',
//       // endDate: '2024-11-06 16:00:00'
//     }
//     console.log('getTurbineWarnData_params:', params)
//     const response = await getTurbineWarnList(params)
//     console.log('getTurbineWarnData返回结果:', response)
//     turbineWarnList.value = response.data.result
//   } catch (error) {
//     console.error('获取风机矩阵数据失败:', error)
//   }
// }
const getTurbineWarnData = async () => {
  try {
    if (windFarmId.value === -1) {
      // 获取排除"全部场站"后的真实风场列表
      const realFarms = windFarmList.value.slice(1)
      // 并发获取所有风场数据
      const responses = await Promise.all(
        realFarms.map((farm) =>
          getTurbineWarnList({
            windFarmId: farm.windFarmId,
            startDate: formatDate(startDate.value),
            endDate: formatDate(endDate.value)
          })
        )
      )
      // 合并所有结果
      turbineWarnList.value = responses.flatMap((r) => r.data.result)
    } else {
      // 原有单个风场请求逻辑
      const params = {
        windFarmId: windFarmId.value,
        startDate: formatDate(startDate.value),
        endDate: formatDate(endDate.value)
      }
      // console.log('params:', params)
      const response = await getTurbineWarnList(params)
      // console.log('getTurbineWarnList:', response)
      turbineWarnList.value = response.data.result
    }
  } catch (error) {
    console.error('获取风机矩阵数据失败:', error)
  }
}

// 组件挂载时初始化默认时间范围 获取风场
onMounted(async () => {
  try {
    initDefaultTimeRange()
    await getCompanyList()
    await getWindFarm()
  } catch (error) {
    console.error('Initialization error:', error)
  }
})
// 监听公司变化，重新获取风场列表
watch(companyId, async (newVal) => {
  if (!newVal) return
  try {
    await getWindFarm()
    if (windFarmList.value.length && startDate.value && endDate.value) {
      page.value = 1
      await getWarningData()
      await getTurbineWarnData()
    }
  } catch (error) {
    console.error('公司变化时获取风场失败', error)
  }
})
// 监听开始时间、结束时间和风场 ID 的变化
watch([startDate, endDate, windFarmId], () => {
  if (windFarmList.value.length && startDate.value && endDate.value) {
    page.value = 1
    getWarningData()
    getTurbineWarnData()
  }
})
const handlePageChange = (newPage) => {
  page.value = newPage
  getWarningData()
}
</script>

<template>
  <div class="time">
    <el-button type="primary" @click="handleRecentSevenDays">最近7天</el-button>
    <el-button type="primary" @click="handleRecentThirtyDays">最近30天</el-button>

    <el-date-picker
      v-model="startDate"
      type="datetime"
      placeholder="选择开始时间"
      :clearable="true"
      format="YYYY-MM-DD HH:mm:ss"
      value-format="YYYY-MM-DD HH:mm:ss"
      style="width: 180px"
      :disabledDate="disabledDate"
      @change="validateStartDate"
    ></el-date-picker>

    <span class="date-separator">至</span>

    <el-date-picker
      v-model="endDate"
      type="datetime"
      placeholder="选择结束时间"
      :clearable="true"
      format="YYYY-MM-DD HH:mm:ss"
      value-format="YYYY-MM-DD HH:mm:ss"
      style="width: 180px"
      :disabledDate="disabledDate"
      @change="validateEndDate"
    ></el-date-picker>
    <el-form-item label="公司：" prop="companyId">
      <el-select
        v-model="companyId"
        placeholder="请选择公司"
        class="wind-farm-select"
        style="width: 180px; --el-input-text-color: white"
        disabled
      >
        <el-option
          v-for="company in companyList"
          :key="company.companyId"
          :label="company.companyName"
          :value="company.companyId"
        ></el-option>
      </el-select>
    </el-form-item>
    <el-form-item label="场站：" prop="windFarmId">
      <el-select
        v-model="windFarmId"
        placeholder="请选择风场"
        clearable
        style="width: 180px; --el-input-text-color: white"
      >
        <el-option
          v-for="windFarm in windFarmList"
          :key="windFarm.windFarmId"
          :label="windFarm.windFarmName"
          :value="windFarm.windFarmId"
        ></el-option>
      </el-select>
    </el-form-item>
  </div>
  <div class="container">
    <div class="windFarm">
      <windFarm :turbineWarnList="turbineWarnList" />
    </div>
    <div class="warning">
      <warning
        :warning-list="warningList"
        :total-count="totalCount"
        :current-page="page"
        :page-size="pageSize"
        :total-pages="totalPages"
        @page-change="handlePageChange"
      />
    </div>
  </div>
</template>

<style scoped>
.time {
  display: flex;
  justify-content: center;
  gap: 10px;
}
.container {
  display: flex;
  /* overflow: hidden; */
  border: 1px solid #164b6d;
  height: 78vh;
}
.windFarm {
  flex: 4;
  border: 1px solid #164b6d;
  overflow: auto;
}
.warning {
  flex: 3;
  border: 1px solid #164b6d;
  overflow: auto;
}

/* 表单 */
:deep(.el-form-item__label) {
  color: white !important;
}

:deep(.el-select__wrapper) {
  background-color: transparent !important;
  color: white;
}

:deep(.el-select-dropdown) {
  background-color: rgba(0, 0, 0, 0.5) !important;
  color: white;
}

:deep(.el-select-dropdown__item.hover),
:deep(.el-select-dropdown__item:hover) {
  background-color: rgba(255, 255, 255, 0.1) !important;
}

:deep(.el-input__wrapper) {
  background-color: transparent !important;
}

:deep(.el-input__inner) {
  background-color: transparent !important;
  color: white !important;
}

:deep(.el-input) {
  --el-input-bg-color: transparent !important;
  --el-input-text-color: white !important;
}
</style>

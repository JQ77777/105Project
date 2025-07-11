<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import { getPvFarmList, getDevice } from '@/api/overview'
import { getWarning } from '@/api/warning'
import warningDetail from '@/components/warningList/warningDetail.vue'
import { getFarmInfo } from '@/api/warningDetail'
import { ElMessage } from 'element-plus'
// 公司相关变量
import { getCompany } from '@/api/company'
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

/* ========= 1. 基础状态 ========= */
const pvFarmId = ref('')
const boxId = ref('')
const inverterId = ref('')
const combinerId = ref('')

const pvFarmList = ref([])
const boxList = ref([])
const inverterList = ref([])
const combinerList = ref([])

const warningList = ref([])

const level = ref('')
const levelList = ref([
  { levelId: '', levelName: '全部' },
  { levelId: 1, levelName: '1级' },
  { levelId: 2, levelName: '2级' }
])

/* ========= 2. 时间 & 分页 ========= */
const startDate = ref(null)
const endDate = ref(null)
const totalCount = ref(0)
const page = ref(1)
const pageSize = ref(10)
const totalPages = ref(0)

const formatDate = (d) => {
  if (!d) return null
  const t = new Date(d)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(
    2,
    '0'
  )} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(
    2,
    '0'
  )}:${String(t.getSeconds()).padStart(2, '0')}`
}
const getCurrentTime = () => new Date()
const getDateBefore = (days) => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}
const initDefaultTimeRange = () => {
  endDate.value = formatDate(getCurrentTime())
  startDate.value = formatDate(getDateBefore(7))
}
const disabledDate = (time) => time > getCurrentTime()
const validateStartDate = (val) => {
  if (endDate.value && new Date(val) > new Date(endDate.value)) {
    ElMessage.error('开始时间不能晚于结束时间')
    startDate.value = null
  }
}
const validateEndDate = (val) => {
  if (startDate.value && new Date(val) < new Date(startDate.value)) {
    ElMessage.error('结束时间不能早于开始时间')
    endDate.value = null
  }
}

/* ========= 3. 下拉列表含“全部” ========= */
const pvFarmListWithAll = computed(() => [{ id: '', pvFarmName: '全部' }, ...pvFarmList.value])
const boxListWithAll = computed(() => [{ boxId: '', boxName: '全部' }, ...boxList.value])
const inverterListWithAll = computed(() => [{ inverterId: '', inverterName: '全部' }, ...inverterList.value])
const combinerListWithAll = computed(() => [{ combinerId: '', combinerName: '全部' }, ...combinerList.value])

/* ========= 4. API ========= */
const getPvFarm = async () => {
  try {
    const params = { companyId: companyId.value }
    const { data } = await getPvFarmList(params)
    pvFarmList.value = data.result || []
  } catch (e) {
    console.error('获取场站失败', e)
  }
}

const getDeviceInfo = async () => {
  if (!pvFarmId.value) {
    resetAllSubLists()
    return
  }
  try {
    const { data } = await getDevice({ pvFarmId: pvFarmId.value })
    const tree = data.result || []
    boxList.value = tree.map((t) => ({
      boxId: t.boxTrans.id,
      boxName: t.boxTrans.boxName,
      inverters: t.innerDeviceInfoList || []
    }))
    resetAllSubLists(false) // 只清空箱变以下
  } catch (e) {
    console.error('获取设备树失败', e)
  }
}

/* ========= 5. 级联处理 ========= */
const resetAllSubLists = (clearBox = true) => {
  if (clearBox) boxId.value = ''
  inverterId.value = ''
  combinerId.value = ''
  if (clearBox) boxList.value = []
  inverterList.value = []
  combinerList.value = []
}

watch(boxId, (val) => {
  const box = boxList.value.find((b) => b.boxId === val)
  inverterList.value = val
    ? box?.inverters.map((it) => ({
        inverterId: it.inverter.id,
        inverterName: it.inverter.inverterName,
        combinerBoxList: it.combinerBoxList || []
      }))
    : []
  inverterId.value = ''
  combinerList.value = []
  combinerId.value = ''
  getWarningData()
})

watch(inverterId, (val) => {
  const inv = inverterList.value.find((i) => i.inverterId === val)
  combinerList.value = val
    ? (inv?.combinerBoxList || []).map((c) => ({
        combinerId: c.id,
        combinerName: c.combinerBoxName
      }))
    : []
  combinerId.value = ''
  getWarningData()
})

/* ========= 6. 预警数据 ========= */
const getWarningData = async () => {
  try {
    const params = {
      companyId: companyId.value,
      page: page.value,
      pageSize: pageSize.value,
      startDate: startDate.value,
      endDate: endDate.value
    }
    if (pvFarmId.value) params.pvFarmId = pvFarmId.value
    if (inverterId.value) params.inverterId = inverterId.value
    if (combinerId.value) params.combinerId = combinerId.value
    if (level.value !== '') params.warningLevel = level.value

    console.log('getWarningData_params', params)
    const { data } = await getWarning(params)
    console.log('getWarningData_返回', data)
    const warnings = data.result.warningList

    // 获取电站名称并合并到预警项
    const farmNameCache = {}
    const updatedWarnings = await Promise.all(
      warnings.map(async (warning) => {
        const deviceId = warning.deviceId
        const deviceType = warning.modelType

        // 创建唯一缓存键
        const cacheKey = `${deviceType}:${deviceId}`

        if (farmNameCache[cacheKey]) {
          return { ...warning, pvFarmName: farmNameCache[cacheKey] }
        }

        try {
          // 修正参数传递（使用正确的字段名）
          const farmResponse = await getFarmInfo({
            deviceId,
            deviceType
          })

          // 检查响应结构（根据实际响应调整）
          const result = farmResponse.data?.result || {}
          const pvFarmName = result.pvFarmName || '未知电站'

          farmNameCache[cacheKey] = pvFarmName
          return { ...warning, pvFarmName }
        } catch (error) {
          console.error('场站信息获取失败', { deviceId, deviceType, error })
          return { ...warning, pvFarmName: '未知电站' }
        }
      })
    )
    warningList.value = updatedWarnings

    // warningList.value = data.result.warningList
    totalCount.value = data.result.total_count
    page.value = data.result.page
    totalPages.value = data.result.total_pages
  } catch (e) {
    console.error('获取预警失败', e)
  }
}

/* ========= 7. 生命周期 ========= */
onMounted(async () => {
  initDefaultTimeRange()
  await getCompanyList()
  await getPvFarm()
  getWarningData()
})

/* ========= 8. 其它辅助 ========= */
const handlePageChange = (cur) => {
  page.value = cur
  getWarningData()
}
const handleSizeChange = (size) => {
  pageSize.value = size
  page.value = 1
  getWarningData()
}
const levelMap = { 1: { label: '1级' }, 2: { label: '2级' } }
const statusMap = {
  0: { label: '未处理', color: 'red' },
  1: { label: '挂起', color: 'yellow' },
  2: { label: '转通知', color: 'green' },
  3: { label: '关闭待确认', color: 'orange' },
  4: { label: '关闭', color: 'white' }
}

const lookDialogVisible = ref(false)
const detail = ref({})
const look = (row) => {
  detail.value = row
  lookDialogVisible.value = true
}

/* ========= 9. 监听 ========= */
watch(pvFarmId, () => {
  resetAllSubLists()
  getDeviceInfo()
  getWarningData()
})

watch([combinerId, level, startDate, endDate], () => getWarningData())
</script>

<template>
  <div class="container">
    <!-- 公司名独占一行 -->
    <div class="company-line">
      <span class="label">公司</span>
      <el-select
        v-model="companyId"
        placeholder="请选择公司"
        class="selector"
        style="--el-input-text-color: white"
        disabled
      >
        <el-option
          v-for="company in companyList"
          :key="company.companyId"
          :label="company.companyName"
          :value="company.companyId"
        ></el-option>
      </el-select>
    </div>

    <!-- 全部筛选控件，自动换行 -->
    <div class="filter-line">
      <span class="label">场站</span>
      <el-select v-model="pvFarmId" class="selector" style="--el-input-text-color: white">
        <el-option v-for="f in pvFarmListWithAll" :key="f.id" :label="f.pvFarmName" :value="f.id" />
      </el-select>

      <span class="label">箱变</span>
      <el-select v-model="boxId" class="selector" style="--el-input-text-color: white; width: 110px">
        <el-option v-for="b in boxListWithAll" :key="b.boxId" :label="b.boxName" :value="b.boxId" />
      </el-select>

      <span class="label">逆变器</span>
      <el-select v-model="inverterId" class="selector" style="--el-input-text-color: white; width: 180px">
        <el-option
          v-for="inv in inverterListWithAll"
          :key="inv.inverterId"
          :label="inv.inverterName"
          :value="inv.inverterId"
        />
      </el-select>

      <span class="label">汇流箱</span>
      <el-select v-model="combinerId" class="selector" style="--el-input-text-color: white; width: 220px">
        <el-option v-for="c in combinerListWithAll" :key="c.combinerId" :label="c.combinerName" :value="c.combinerId" />
      </el-select>

      <span class="label">等级</span>
      <el-select v-model="level" class="selector level-selector" style="--el-input-text-color: white">
        <el-option v-for="l in levelList" :key="l.levelId" :label="l.levelName" :value="l.levelId" />
      </el-select>

      <el-date-picker
        v-model="startDate"
        type="datetime"
        format="YYYY-MM-DD HH:mm:ss"
        value-format="YYYY-MM-DD HH:mm:ss"
        :disabled-date="disabledDate"
        @change="validateStartDate"
        class="date-picker"
        placeholder="开始时间"
      />
      <span class="date-sep">至</span>
      <el-date-picker
        v-model="endDate"
        type="datetime"
        format="YYYY-MM-DD HH:mm:ss"
        value-format="YYYY-MM-DD HH:mm:ss"
        :disabled-date="disabledDate"
        @change="validateEndDate"
        class="date-picker"
        placeholder="结束时间"
      />
    </div>

    <!-- 表格 -->
    <el-table :data="warningList" style="margin-top: 10px">
      <el-table-column label="序号" width="80" align="center">
        <template #default="scope">{{ scope.$index + 1 }}</template>
      </el-table-column>
      <el-table-column label="开始时间" width="200" align="center">
        <template #default="scope">{{ scope.row.startTime.replace('T', ' ') }}</template>
      </el-table-column>
      <el-table-column label="结束时间" width="200" align="center">
        <template #default="scope">{{ scope.row.endTime.replace('T', ' ') }}</template>
      </el-table-column>
      <el-table-column prop="pvFarmName" label="场站名称" width="220" align="center" />
      <el-table-column prop="deviceName" label="设备名称" width="250" align="center" />
      <el-table-column prop="warningDescription" label="预警信息" align="center" />
      <el-table-column prop="warningLevel" label="等级" width="120" align="center">
        <template #default="scope">{{ levelMap[scope.row.warningLevel]?.label }}</template>
      </el-table-column>
      <el-table-column prop="warningStatus" label="状态" width="120" align="center">
        <template #default="scope">
          <span :style="{ color: statusMap[scope.row.warningStatus]?.color }">
            {{ statusMap[scope.row.warningStatus]?.label }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="详情" width="120" align="center">
        <template #default="scope">
          <el-link type="primary" @click="look(scope.row)">查看</el-link>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div class="pager-line">
      <span>共 {{ totalCount }} 条 / {{ totalPages }} 页</span>
      <el-pagination
        background
        layout="prev, pager, next, sizes, jumper"
        :page-size="pageSize"
        :current-page="page"
        :page-sizes="[10, 15, 20, 30]"
        :total="totalCount"
        @size-change="handleSizeChange"
        @current-change="handlePageChange"
      />
    </div>

    <!-- 详情弹窗 -->
    <el-dialog title="预警详情" v-model="lookDialogVisible" width="90%">
      <warningDetail v-if="lookDialogVisible" v-bind="detail" />
    </el-dialog>
  </div>
</template>

<style scoped>
.container {
  padding: 10px;
  margin-top: 10px;
  border: 1px solid #164b6d;
  height: 80vh;
  display: flex;
  flex-direction: column;
}
.company-line {
  margin-bottom: 10px;
  display: flex;
  gap: 15px;
}
.filter-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 15px;
  margin-bottom: 10px;
}
.label {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #143f5c;
  border: 1px solid #143f5c;
  font-size: 15px;
  width: 60px;
  height: 8px;
  padding: 10px;
}
.selector {
  width: 160px;
}
.level-selector {
  width: 100px;
}
.date-picker {
  width: 180px;
}
.date-sep {
  margin: 0 5px;
  color: white;
}
.company {
  background: linear-gradient(to bottom, #102842, #15608a);
  width: 140px;
  font-size: 15px;
  padding: 15px;
  color: white;
  border: #164476;
}
.pager-line {
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 20px 0;
  gap: 10px;
  color: #c2dcf5;
}
.span-name {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 15px;
  background: #143f5c;
  border: 1px solid #143f5c;
  font-size: 15px;
  width: 60px;
  height: 8px;
  padding: 10px;
}
.pv-farm-select {
  width: 160px;
}
.operation {
  background-color: #36b8da;
  border: 1px solid #36b8da;
  font-size: 15px;
  color: white;
}
.info {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-text {
  display: flex;
  align-items: center;
  gap: 15px;
}

.info-button {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* .info-text::after {
  content: '';
  height: 35px;
  width: 2px;
  background-color: #15608a;
  margin-left: -1202px;
} */

.info-text {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 15px;
  padding: 10px;
}

.el-table {
  border-collapse: collapse;
  text-align: center;
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
/* 表格样式 */
:deep(.el-table) {
  border: 1px solid #164b6d !important;
  background-color: transparent !important;

  &::before,
  &::after {
    display: none !important;
  }

  --el-table-border-color: transparent !important;

  .el-table__inner-wrapper {
    border-bottom: none !important;
  }

  .el-table__header-wrapper {
    th {
      background-color: #143f5c !important;
      border-bottom: none !important;
      border-right: none !important;
    }
    .el-table__header {
      border-bottom: none !important;
    }
  }

  .el-table__body-wrapper {
    background-color: transparent !important;
    tr {
      background-color: transparent !important;
      td {
        background-color: transparent !important;
        border-bottom: 1px solid #164b6d !important;
        border-right: 1px solid #164b6d !important;
      }
    }
  }

  th {
    color: #ffffff !important;
  }

  td {
    color: #c2dcf5 !important;
  }
}
/* 分页组件 */
:deep(.el-pagination) {
  background-color: transparent !important;
  color: #c2dcf5 !important;

  .el-pager li,
  button.btn-prev,
  button.btn-next {
    background-color: transparent !important;
    color: #c2dcf5 !important;
    border: 1px solid #164b6d !important;
  }

  .el-pager li.is-active {
    background-color: #143f5c !important;
    color: #ffffff !important;
    border-color: #164b6d !important;
  }

  .el-input__wrapper {
    background-color: transparent !important;
    box-shadow: none !important;
    border: 1px solid #164b6d !important;
  }

  .el-input__inner {
    color: #c2dcf5 !important;
  }

  .el-pagination__jump {
    color: #fff !important;
  }
}
/* 弹窗 */
:deep(.el-dialog__wrapper) {
  background-color: rgba(20, 63, 92, var(--overlay-opacity, 0.9)) !important;
}

:deep(.el-dialog) {
  background-color: rgba(20, 63, 92, var(--dialog-opacity, 0.9)) !important;
  box-shadow: none !important;
  color: white !important;
}

/* 针对标题 */
:deep(.el-dialog__header .el-dialog__title) {
  color: white !important;
}

/* 针对内容 */
:deep(.el-dialog__body) {
  color: white !important;
}

/* 如果有关闭按钮 */
:deep(.el-dialog__headerbtn .el-dialog__close) {
  color: white !important;
}
</style>
